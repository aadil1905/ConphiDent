import { prisma } from "@/lib/prisma";
import { currentWhatsAppClinicId } from "@/lib/whatsapp-context";

let primaryClinicPromise: ReturnType<typeof prisma.clinic.findFirst> | null = null;

export async function primaryClinic() {
  const scopedClinicId = currentWhatsAppClinicId();
  if (scopedClinicId) return prisma.clinic.findUnique({ where: { id: scopedClinicId } });
  primaryClinicPromise ??= prisma.clinic.findFirst({ orderBy: { id: "asc" } });
  return primaryClinicPromise;
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

export async function recordInboundMessage(phone: string, content: string, messageType = "TEXT", providerMessageId?: string) {
  const conversation = await getConversation(phone);
  try {
    const [, lead] = await prisma.$transaction([
      prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, providerMessageId, direction: "INBOUND", content, messageType } }),
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
    // Meta can retry the same webhook delivery. The provider message id is our durable idempotency key.
    if (providerMessageId && typeof error === "object" && error && "code" in error && error.code === "P2002") return null;
    throw error;
  }
}

export async function recordOutboundMessage(phone: string, content: string, messageType = "TEXT", providerMessageId?: string) {
  const conversation = await getConversation(phone);
  await prisma.whatsAppMessage.create({ data: { conversationId: conversation.id, providerMessageId, direction: "OUTBOUND", content, messageType, deliveryStatus: "SENT", statusUpdatedAt: new Date() } });
}

export async function updateOutboundDeliveryStatus(providerMessageId: string, status: string, failureReason?: string) {
  await prisma.whatsAppMessage.updateMany({
    where: { providerMessageId },
    data: { deliveryStatus: status, statusUpdatedAt: new Date(), failureReason: failureReason || null },
  });
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
  return prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { status, label: label ?? (status === "OPTED_OUT" ? "WhatsApp contact opted out" : null) },
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
