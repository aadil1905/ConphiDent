import { prisma } from "@/lib/prisma";
import { currentWhatsAppClinicId } from "@/lib/whatsapp-context";

export async function primaryClinic() {
  const scopedClinicId = currentWhatsAppClinicId();
  if (!Number.isInteger(scopedClinicId) || !scopedClinicId) return null;
  return prisma.clinic.findUnique({ where: { id: scopedClinicId } });
}

export async function getConversation(phone: string) {
  const clinic = await primaryClinic();
  if (!clinic) throw new Error("No clinic has been configured yet.");
  const [patient, lead] = await Promise.all([
    prisma.patient.findUnique({ where: { clinicId_phone: { clinicId: clinic.id, phone } }, select: { id: true } }),
    prisma.lead.findUnique({ where: { clinicId_phone: { clinicId: clinic.id, phone } }, select: { id: true } }),
  ]);
  return prisma.whatsAppConversation.upsert({
    where: { clinicId_phone: { clinicId: clinic.id, phone } },
    create: { clinicId: clinic.id, phone, patientId: patient?.id, leadId: lead?.id },
    update: {
      lastMessageAt: new Date(),
      ...(patient ? { patientId: patient.id } : {}),
      ...(lead ? { leadId: lead.id } : {}),
    },
  });
}

async function findConversation(phone: string) {
  const clinic = await primaryClinic();
  if (!clinic) throw new Error("No clinic has been configured yet.");
  return prisma.whatsAppConversation.findUnique({ where: { clinicId_phone: { clinicId: clinic.id, phone } } });
}

export async function recordInboundMessage(phone: string, content: string, messageType = "TEXT", providerMessageId?: string, providerTimestamp?: Date) {
  const conversation = await getConversation(phone);
  try {
    const [, lead] = await prisma.$transaction([
      prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, providerMessageId, direction: "INBOUND", content, messageType, ...(providerTimestamp ? { createdAt: providerTimestamp } : {}) } }),
      prisma.lead.upsert({
        where: { clinicId_phone: { clinicId: conversation.clinicId, phone } },
        create: { clinicId: conversation.clinicId, phone, fullName: `WhatsApp lead ${phone.slice(-4)}`, source: "WhatsApp", activities: { create: { type: "WHATSAPP_ENQUIRY", content: "New WhatsApp conversation started" } } },
        update: { lastContactedAt: new Date() },
      }),
    ]);
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { leadId: lead.id },
    });
    return conversation;
  } catch (error) {
    // The webhook inbox decides whether side effects must be replayed. Returning
    // the existing conversation here lets an interrupted PENDING event resume
    // after its message row was already committed.
    if (providerMessageId && typeof error === "object" && error && "code" in error && error.code === "P2002") return conversation;
    throw error;
  }
}

export async function recordOutboundMessage(phone: string, content: string, messageType = "TEXT", providerMessageId?: string) {
  const conversation = await getConversation(phone);
  await prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, providerMessageId, direction: "OUTBOUND", content, messageType, deliveryStatus: "SENT" } });
}

const deliveryStatusRank: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

export async function updateOutboundDeliveryStatus(providerMessageId: string, status: string, failureReason?: string, providerTimestamp?: Date) {
  const clinicId = currentWhatsAppClinicId();
  if (!Number.isInteger(clinicId) || !clinicId) {
    throw new Error("A clinic-scoped WhatsApp context is required to update delivery status.");
  }
  const message = await prisma.whatsAppMessage.findFirst({
    where: { providerMessageId, conversation: { clinicId } },
    select: { id: true, deliveryStatus: true, statusUpdatedAt: true },
  });
  if (!message) {
    throw new Error("The outbound WhatsApp message was not found in the routed clinic; retry status processing later.");
  }
  const eventTime = providerTimestamp || new Date();
  if (message.statusUpdatedAt && eventTime < message.statusUpdatedAt) return { count: 0 };
  if (
    message.statusUpdatedAt &&
    eventTime.getTime() === message.statusUpdatedAt.getTime() &&
    (deliveryStatusRank[status] ?? -1) < (deliveryStatusRank[message.deliveryStatus] ?? -1)
  ) return { count: 0 };
  const updated = await prisma.whatsAppMessage.updateMany({
    where: { id: message.id, statusUpdatedAt: message.statusUpdatedAt },
    data: { deliveryStatus: status, statusUpdatedAt: eventTime, failureReason: failureReason || null },
  });
  return updated;
}

export async function getRecentConversationMessages(phone: string) {
  const conversation = await findConversation(phone);
  if (!conversation) return [];
  return prisma.whatsAppMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 18 });
}

export async function setConversationLanguage(phone: string, language: string | null) {
  const conversation = await getConversation(phone);
  await prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { language } });
}

export async function getConversationLanguage(phone: string) {
  const conversation = await findConversation(phone);
  return conversation?.language || "en";
}

export async function getConversationState(phone: string) {
  return findConversation(phone);
}

/** Preserve a patient's WhatsApp contact preference without deleting the audit trail. */
export async function setConversationContactStatus(phone: string, status: "OPEN" | "OPTED_OUT", label?: string) {
  const conversation = await getConversation(phone);
  const consentStatus = status === "OPTED_OUT" ? "WITHDRAWN" : "GRANTED";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.whatsAppConversation.update({ where: { id: conversation.id }, data: { status, label: label ?? (status === "OPTED_OUT" ? "WhatsApp contact opted out" : null), consentStatus, consentPurpose: "CARE_COMMUNICATION", consentAt: new Date() } });
    await tx.whatsAppConsentEvent.create({ data: { clinicId: conversation.clinicId, patientId: conversation.patientId, phone, purpose: "CARE_COMMUNICATION", status: consentStatus, source: "PATIENT_WHATSAPP_KEYWORD", evidence: status === "OPTED_OUT" ? "Patient sent STOP/opt-out keyword" : "Patient sent START/opt-in keyword" } });
    return updated;
  });
}

export async function isWhatsAppContactOptedOut(phone: string) {
  const conversation = await findConversation(phone);
  return conversation?.status === "OPTED_OUT";
}

export async function getBooking(phone: string) {
  const conversation = await findConversation(phone);
  if (!conversation) return null;
  return prisma.whatsAppBooking.findUnique({ where: { conversationId: conversation.id } });
}

export async function startPersistentBooking(phone: string) {
  const conversation = await getConversation(phone);
  return prisma.whatsAppBooking.upsert({ where: { conversationId: conversation.id }, create: { conversationId: conversation.id }, update: { step: "name", patientName: "", phone: "", appointmentDate: "", appointmentTime: "", reason: "" } });
}

export async function updateBooking(phone: string, data: Record<string, string>) {
  const conversation = await getConversation(phone);
  return prisma.whatsAppBooking.update({ where: { conversationId: conversation.id }, data });
}

export async function clearPersistentBooking(phone: string) {
  const conversation = await findConversation(phone);
  if (!conversation) return;
  await prisma.whatsAppBooking.deleteMany({ where: { conversationId: conversation.id } });
}

export async function markLeadBooked(phone: string, appointmentId: number, fullName: string) {
  const conversation = await getConversation(phone);
  await prisma.lead.updateMany({ where: { clinicId: conversation.clinicId, phone }, data: { fullName, stage: "BOOKED", bookedAppointmentId: appointmentId, lastContactedAt: new Date() } });
}
