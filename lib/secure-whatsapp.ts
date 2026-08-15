import "server-only";

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canonicalWhatsAppPhone } from "@/lib/phone";
import { encryptSecureDispatchPayload } from "@/lib/secure-dispatch-payload";
import { createSecureDocumentLink, type SecureDocumentType } from "@/lib/secure-documents";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class SecureWhatsAppDeliveryError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type QueueSecureDeliveryInput = {
  clinicId: number;
  clinicName: string;
  patientId: number;
  patientName: string;
  phone: string;
  documentType: SecureDocumentType;
  documentId: number;
  documentLabel: string;
  purpose: "BILLING_DOCUMENTS" | "PRESCRIPTIONS";
  sourceType: "INVOICE" | "PRESCRIPTION";
  actorUserId: number;
  actorRole: string;
  auditAction: string;
  consentConfirmed: boolean;
  preferredTemplateName?: string;
  preferredTemplateLanguage?: string;
  clinicalFooter?: string;
};

function deliveryBucket(now: Date) {
  return now.toISOString().slice(0, 13).replaceAll(/[-T]/g, "");
}

async function serviceWindowIsOpen(clinicId: number, phone: string, now: Date) {
  return Boolean(await prisma.whatsAppMessage.findFirst({
    where: {
      direction: "INBOUND",
      createdAt: { gte: new Date(now.getTime() - SERVICE_WINDOW_MS) },
      conversation: { clinicId, phone },
    },
    select: { id: true },
  }));
}

async function approvedTemplate(clinicId: number, sourceType: string, preferredName?: string, preferredLanguage = "en") {
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { clinicId, status: "APPROVED", ...(preferredName ? { name: preferredName, language: preferredLanguage } : { name: { contains: sourceType.toLowerCase(), mode: "insensitive" } }) },
    orderBy: { updatedAt: "desc" },
    select: { name: true, language: true },
  });
  return template || null;
}

/**
 * Atomically grants/re-confirms purpose consent, rotates the secure token, writes
 * the audit record, and creates one durable outbox row. The hour bucket prevents
 * double-click duplicates while allowing an intentional later resend to rotate
 * and revoke the prior link.
 */
export async function queueSecureWhatsAppDocument(input: QueueSecureDeliveryInput) {
  const phone = canonicalWhatsAppPhone(input.phone);
  if (!phone) throw new SecureWhatsAppDeliveryError("Patient WhatsApp number is invalid.", 400);
  const now = new Date();
  const latestConsent = await prisma.whatsAppConsentEvent.findFirst({
    where: { clinicId: input.clinicId, patientId: input.patientId, phone, purpose: input.purpose },
    orderBy: { createdAt: "desc" },
  });
  const needsConsentGrant = latestConsent?.status !== "GRANTED";
  if (needsConsentGrant && !input.consentConfirmed) {
    throw new SecureWhatsAppDeliveryError(`Confirm the patient consented to receive ${input.purpose === "PRESCRIPTIONS" ? "prescriptions" : "billing documents"} on WhatsApp.`, 409);
  }

  const [windowOpen, template] = await Promise.all([
    serviceWindowIsOpen(input.clinicId, phone, now),
    approvedTemplate(input.clinicId, input.sourceType, input.preferredTemplateName, input.preferredTemplateLanguage),
  ]);
  if (!windowOpen && !template) {
    throw new SecureWhatsAppDeliveryError("No approved WhatsApp utility template is configured for delivery outside the 24-hour service window.", 409);
  }

  const idempotencyKey = `${input.sourceType.toLowerCase()}:${input.documentId}:secure-share:${deliveryBucket(now)}`;
  const correlationId = randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledWhatsAppMessage.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          existing.clinicId !== input.clinicId
          || existing.patientId !== input.patientId
          || existing.phone !== phone
          || existing.purpose !== input.purpose
          || existing.sourceType !== input.sourceType
          || existing.sourceId !== String(input.documentId)
        ) {
          throw new SecureWhatsAppDeliveryError("The secure-delivery idempotency key belongs to a different document scope.", 409);
        }
        if (needsConsentGrant && existing.status !== "SENT") {
          await tx.whatsAppConsentEvent.create({ data: { clinicId: input.clinicId, patientId: input.patientId, phone, purpose: input.purpose, status: "GRANTED", source: "STAFF_RECORDED", actorUserId: input.actorUserId, evidence: "Staff confirmed current patient purpose consent before secure delivery", correlationId } });
        }
        if (["FAILED", "DEAD_LETTER", "CANCELLED"].includes(existing.status)) {
          const outcomeUncertain = existing.status === "DEAD_LETTER" && /outcome (?:may be )?unknown/i.test(existing.failureReason || "");
          if (outcomeUncertain) {
            throw new SecureWhatsAppDeliveryError("The provider outcome is unknown and delivery may already have succeeded. Verify it before sending this document again.", 409);
          }
          await tx.secureDocumentAccess.updateMany({
            where: { clinicId: input.clinicId, patientId: input.patientId, documentType: input.documentType, documentId: input.documentId, revokedAt: null },
            data: { revokedAt: now },
          });
          const secure = await createSecureDocumentLink({ clinicId: input.clinicId, patientId: input.patientId, documentType: input.documentType, documentId: input.documentId, createdByUserId: input.actorUserId, expiresInHours: 72 }, tx);
          const expiry = secure.expiresAt.toLocaleString("en-IN");
          const content = [
            `Hello ${input.patientName},`,
            `Your ${input.documentLabel} from ${input.clinicName} is ready.`,
            `Open the private document: ${secure.url}`,
            `This link expires ${expiry}. Please do not forward it.`,
            input.clinicalFooter || "Reply here if you need help.",
          ].join("\n\n");
          const templateParameters = template ? [input.patientName, input.clinicName, input.documentLabel, secure.url, expiry] : [];
          await tx.scheduledWhatsAppMessage.update({
            where: { id: existing.id },
            data: {
              status: "SCHEDULED",
              attempts: 0,
              scheduledAt: now,
              lastAttemptAt: null,
              sentAt: null,
              cancelledAt: null,
              failureReason: null,
              providerMessageId: null,
              messageType: windowOpen ? "TEXT" : "TEMPLATE",
              templateName: template?.name,
              templateLanguage: template?.language || "en",
              templateParameters: Prisma.JsonNull,
              dispatchPayloadCiphertext: encryptSecureDispatchPayload({ content, templateParameters }),
              createdByUserId: input.actorUserId,
              correlationId,
            },
          });
          await tx.auditLog.create({ data: { clinicId: input.clinicId, userId: input.actorUserId, patientId: input.patientId, actorRole: input.actorRole, action: input.auditAction, entityType: input.sourceType, entityId: String(input.documentId), detail: "Private expiring document link rotated and re-queued without plaintext clinical or financial details", source: "WHATSAPP", correlationId } });
          return { queued: true, reused: true, messageId: existing.id };
        }
        return { queued: true, reused: true, messageId: existing.id };
      }

      if (needsConsentGrant) {
        await tx.whatsAppConsentEvent.create({ data: { clinicId: input.clinicId, patientId: input.patientId, phone, purpose: input.purpose, status: "GRANTED", source: "STAFF_RECORDED", actorUserId: input.actorUserId, evidence: "Staff confirmed current patient purpose consent before secure delivery", correlationId } });
      }
      await tx.secureDocumentAccess.updateMany({
        where: { clinicId: input.clinicId, patientId: input.patientId, documentType: input.documentType, documentId: input.documentId, revokedAt: null },
        data: { revokedAt: now },
      });
      const secure = await createSecureDocumentLink({ clinicId: input.clinicId, patientId: input.patientId, documentType: input.documentType, documentId: input.documentId, createdByUserId: input.actorUserId, expiresInHours: 72 }, tx);
      const expiry = secure.expiresAt.toLocaleString("en-IN");
      const content = [
        `Hello ${input.patientName},`,
        `Your ${input.documentLabel} from ${input.clinicName} is ready.`,
        `Open the private document: ${secure.url}`,
        `This link expires ${expiry}. Please do not forward it.`,
        input.clinicalFooter || "Reply here if you need help.",
      ].join("\n\n");
      const templateParameters = template ? [input.patientName, input.clinicName, input.documentLabel, secure.url, expiry] : [];
      const message = await tx.scheduledWhatsAppMessage.create({ data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        phone,
        content: `Secure ${input.documentLabel} delivery queued; private link redacted.`,
        messageType: windowOpen ? "TEXT" : "TEMPLATE",
        templateName: template?.name,
        templateLanguage: template?.language || "en",
        templateParameters: Prisma.JsonNull,
        dispatchPayloadCiphertext: encryptSecureDispatchPayload({ content, templateParameters }),
        scheduledAt: now,
        status: "SCHEDULED",
        createdByUserId: input.actorUserId,
        idempotencyKey,
        purpose: input.purpose,
        sourceType: input.sourceType,
        sourceId: String(input.documentId),
        correlationId,
      } });
      await tx.auditLog.create({ data: { clinicId: input.clinicId, userId: input.actorUserId, patientId: input.patientId, actorRole: input.actorRole, action: input.auditAction, entityType: input.sourceType, entityId: String(input.documentId), detail: "Private expiring document link queued without plaintext clinical or financial details", source: "WHATSAPP", correlationId } });
      return { queued: true, reused: false, messageId: message.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return outcome;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.scheduledWhatsAppMessage.findUnique({ where: { idempotencyKey }, select: { id: true } });
        if (existing) return { queued: true, reused: true, messageId: existing.id };
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Could not queue the secure WhatsApp document after retrying.");
}
