import { prisma } from "@/lib/prisma";
import { WhatsAppDeliveryUncertainError, sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { canonicalWhatsAppPhone } from "@/lib/phone";
import { decryptSecureDispatchPayload } from "@/lib/secure-dispatch-payload";
import { acceptedConsentPurposes, isPatientWhatsAppPurpose } from "@/lib/patient-whatsapp-policy";

const activeStatuses = ["SCHEDULED", "FAILED"];
const PROCESSING_TIMEOUT_MS = 10 * 60_000;

export async function scheduleWhatsAppMessage(input: {
  clinicId: number; phone: string; content: string; scheduledAt: Date; createdByUserId?: number; idempotencyKey?: string; purpose?: string; sourceType?: string; sourceId?: string; correlationId?: string;
}) {
  const phone = canonicalWhatsAppPhone(input.phone);
  if (!phone) throw new Error("Enter a valid WhatsApp number with country code.");
  if (input.idempotencyKey) return prisma.scheduledWhatsAppMessage.upsert({ where: { idempotencyKey: input.idempotencyKey }, create: { ...input, phone, status: "SCHEDULED" }, update: {} });
  return prisma.scheduledWhatsAppMessage.create({ data: { ...input, phone, status: "SCHEDULED" } });
}

export async function cancelScheduledWhatsAppMessage(id: number, clinicId: number) {
  const item = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id, clinicId }, select: { id: true, patientId: true, sourceType: true, sourceId: true } });
  if (!item) return { count: 0 };
  const now = new Date();
  const documentId = Number(item.sourceId);
  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.scheduledWhatsAppMessage.updateMany({
      where: { id, clinicId, status: { in: ["SCHEDULED", "FAILED", "DEAD_LETTER"] } },
      data: { status: "CANCELLED", cancelledAt: now, dispatchPayloadCiphertext: null },
    });
    if (cancelled.count && item.patientId && Number.isInteger(documentId) && ["INVOICE", "PRESCRIPTION"].includes(item.sourceType || "")) {
      await tx.secureDocumentAccess.updateMany({ where: { clinicId, patientId: item.patientId, documentType: item.sourceType!, documentId, revokedAt: null }, data: { revokedAt: now } });
    }
    return cancelled;
  });
}

export async function retryScheduledWhatsAppMessage(id: number, clinicId: number) {
  const secureItem = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id, clinicId }, select: { purpose: true, createdAt: true } });
  if (secureItem && ["BILLING_DOCUMENTS", "PRESCRIPTIONS"].includes(secureItem.purpose) && secureItem.createdAt <= new Date(Date.now() - 70 * 60 * 60_000)) {
    return prisma.scheduledWhatsAppMessage.updateMany({ where: { id, clinicId }, data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Secure link is too old to retry. Re-send from the source document." } });
  }
  return prisma.scheduledWhatsAppMessage.updateMany({
    where: { id, clinicId, status: { in: ["FAILED", "DEAD_LETTER"] } },
    data: { status: "SCHEDULED", scheduledAt: new Date(), attempts: 0, failureReason: null },
  });
}

function messageId(result: unknown) {
  if (typeof result !== "object" || result === null || !("messages" in result)) return undefined;
  const messages = result.messages;
  if (!Array.isArray(messages) || typeof messages[0] !== "object" || messages[0] === null || !("id" in messages[0])) return undefined;
  return typeof messages[0].id === "string" ? messages[0].id : undefined;
}

/** Processes a bounded batch so cron invocations remain fast and retry-safe. */
export async function processScheduledWhatsAppMessages(now = new Date(), onlyMessageId?: number) {
  if (!onlyMessageId) await prisma.scheduledWhatsAppMessage.updateMany({
    where: { status: "PROCESSING", lastAttemptAt: { lte: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) } },
    data: { status: "DEAD_LETTER", failureReason: "Provider outcome may be unknown after an interrupted worker. Verify delivery before manual retry." },
  });
  const due = await prisma.scheduledWhatsAppMessage.findMany({
    where: { ...(onlyMessageId ? { id: onlyMessageId } : {}), status: { in: activeStatuses }, scheduledAt: { lte: now }, attempts: { lt: 100 }, clinic: { status: "ACTIVE" } },
    orderBy: { scheduledAt: "asc" }, take: onlyMessageId ? 1 : 40,
  });
  let sent = 0; let failed = 0;
  for (const item of due) {
    let providerAccepted = false;
    if (item.attempts >= item.maxAttempts) {
      await prisma.scheduledWhatsAppMessage.updateMany({ where: { id: item.id, status: { in: activeStatuses } }, data: { status: "DEAD_LETTER" } });
      continue;
    }
    // Claim one row first. A second worker cannot send it after this succeeds.
    const claim = await prisma.scheduledWhatsAppMessage.updateMany({
      where: { id: item.id, status: { in: activeStatuses }, attempts: item.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: now },
    });
    if (!claim.count) continue;
    try {
      const secureDocumentPurpose = item.purpose === "BILLING_DOCUMENTS" || item.purpose === "PRESCRIPTIONS";
      const consentRequired = secureDocumentPurpose || isPatientWhatsAppPurpose(item.purpose);
      if (consentRequired) {
        const patient = item.patientId ? await prisma.patient.findFirst({ where: { id: item.patientId, clinicId: item.clinicId, archivedAt: null }, select: { phone: true } }) : null;
        const consentPurposes = isPatientWhatsAppPurpose(item.purpose) ? acceptedConsentPurposes(item.purpose) : [item.purpose];
        const [latestConsent, optedOut] = item.patientId ? await Promise.all([
          prisma.whatsAppConsentEvent.findFirst({ where: { clinicId: item.clinicId, phone: item.phone, purpose: { in: consentPurposes }, OR: [{ patientId: item.patientId }, { patientId: null }] }, orderBy: { createdAt: "desc" }, select: { status: true } }),
          prisma.whatsAppConversation.findUnique({ where: { clinicId_phone: { clinicId: item.clinicId, phone: item.phone } }, select: { status: true } }),
        ]) : [null, null];
        if (!patient || canonicalWhatsAppPhone(patient.phone) !== item.phone || optedOut?.status === "OPTED_OUT" || latestConsent?.status !== "GRANTED") {
          const documentId = Number(item.sourceId);
          await prisma.$transaction(async (tx) => {
            await tx.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: "CANCELLED", cancelledAt: now, failureReason: "Current patient identity, phone, or purpose consent is not valid.", dispatchPayloadCiphertext: null } });
            if (secureDocumentPurpose && item.patientId && Number.isInteger(documentId) && ["INVOICE", "PRESCRIPTION"].includes(item.sourceType || "")) await tx.secureDocumentAccess.updateMany({ where: { clinicId: item.clinicId, patientId: item.patientId, documentType: item.sourceType!, documentId, revokedAt: null }, data: { revokedAt: now } });
            if (item.sourceType === "FOLLOW_UP" && Number.isInteger(documentId)) await tx.followUpTask.updateMany({ where: { id: documentId, clinicId: item.clinicId, status: "QUEUED" }, data: { status: "FAILED", errorMessage: "WhatsApp delivery cancelled because current patient consent or phone binding is invalid." } });
          });
          continue;
        }
      }
      const serviceWindowOpen = Boolean(await prisma.whatsAppMessage.findFirst({ where: { direction: "INBOUND", createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) }, conversation: { clinicId: item.clinicId, phone: item.phone } }, select: { id: true } }));
      const securePayload = item.dispatchPayloadCiphertext ? decryptSecureDispatchPayload(item.dispatchPayloadCiphertext) : null;
      const dispatchContent = securePayload?.content || item.content;
      const templateParameters = securePayload?.templateParameters || (Array.isArray(item.templateParameters) ? item.templateParameters.filter((value): value is string => typeof value === "string") : []);
      let result: unknown;
      if (consentRequired && !serviceWindowOpen) {
        if (!item.templateName) throw new Error("Approved WhatsApp utility template is required outside the 24-hour service window.");
        result = await sendTemplateMessage(item.phone, item.templateName, item.templateLanguage || "en", templateParameters, item.clinicId);
      } else if (item.messageType === "TEMPLATE") {
        if (!item.templateName) throw new Error("WhatsApp template name is missing.");
        result = await sendTemplateMessage(item.phone, item.templateName, item.templateLanguage || "en", templateParameters, item.clinicId);
      } else {
        result = await sendTextMessage(item.phone, dispatchContent, item.clinicId, item.content);
      }
      providerAccepted = true;
      const sentAt = new Date();
      const sourceId = Number(item.sourceId);
      await prisma.$transaction(async (tx) => {
        await tx.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: "SENT", sentAt, providerMessageId: messageId(result), failureReason: null, dispatchPayloadCiphertext: null } });
        if (!Number.isInteger(sourceId)) return;
        if (item.sourceType === "FOLLOW_UP") await tx.followUpTask.updateMany({ where: { id: sourceId, clinicId: item.clinicId, status: "QUEUED" }, data: { status: "SENT", sentAt, errorMessage: null } });
        if (item.sourceType === "PATIENT_INTAKE") await tx.patientIntakeRequest.updateMany({ where: { id: sourceId, clinicId: item.clinicId, status: { in: ["CREATED", "SENT"] } }, data: { status: "SENT", sentAt } });
        if (item.sourceType === "APPOINTMENT_SELF_SERVICE") await tx.appointmentSelfServiceRequest.updateMany({ where: { id: sourceId, clinicId: item.clinicId }, data: { sentAt } });
        if (item.sourceType === "APPOINTMENT_REMINDER") await tx.appointment.updateMany({ where: { id: sourceId, clinicId: item.clinicId }, data: { reminderSentAt: sentAt } });
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "WhatsApp provider request failed.";
      const nextAttempt = item.attempts + 1;
      const uncertain = providerAccepted || error instanceof WhatsAppDeliveryUncertainError;
      const exhausted = uncertain || nextAttempt >= item.maxAttempts;
      const retryDelay = Math.min(60, 2 ** Math.max(0, nextAttempt - 1) * 5) * 60_000;
      await prisma.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: exhausted ? "DEAD_LETTER" : "SCHEDULED", failureReason: uncertain ? `Outcome unknown: ${message}` : message, scheduledAt: exhausted ? item.scheduledAt : new Date(now.getTime() + retryDelay) } });
      if (exhausted && item.sourceType === "FOLLOW_UP") {
        const sourceId = Number(item.sourceId);
        if (Number.isInteger(sourceId)) await prisma.followUpTask.updateMany({ where: { id: sourceId, clinicId: item.clinicId, status: "QUEUED" }, data: { status: "FAILED", errorMessage: uncertain ? "WhatsApp provider outcome is unknown. Verify delivery before retrying." : message } });
      }
      failed += 1;
    }
  }
  return { processed: due.length, sent, failed };
}
