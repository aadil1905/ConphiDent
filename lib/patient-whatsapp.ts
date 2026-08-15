import "server-only";

import { Prisma } from "@prisma/client";
import { encryptSecureDispatchPayload } from "@/lib/secure-dispatch-payload";
import { prisma } from "@/lib/prisma";
import { canonicalWhatsAppPhone } from "@/lib/phone";
import {
  acceptedConsentPurposes,
  patientWhatsAppCanQueue,
  patientWhatsAppIdempotencyKey,
  type PatientWhatsAppPurpose,
} from "@/lib/patient-whatsapp-policy";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class PatientWhatsAppPolicyError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

export type QueuePatientWhatsAppInput = {
  clinicId: number;
  patientId: number;
  phone: string;
  content: string;
  purpose: PatientWhatsAppPurpose;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  actorUserId: number;
  actorRole: string;
  scheduledAt?: Date;
  consentConfirmed: boolean;
  consentEvidence: string;
  auditAction: string;
  preferredTemplateName?: string;
  preferredTemplateLanguage?: string;
  templateParameters?: string[];
  redactContent?: boolean;
};

async function currentPolicy(input: QueuePatientWhatsAppInput, phone: string) {
  const [patient, conversation, consent, windowMessage] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: input.patientId, clinicId: input.clinicId, archivedAt: null },
      select: { id: true, phone: true },
    }),
    prisma.whatsAppConversation.findUnique({
      where: { clinicId_phone: { clinicId: input.clinicId, phone } },
      select: { status: true },
    }),
    prisma.whatsAppConsentEvent.findFirst({
      where: {
        clinicId: input.clinicId,
        phone,
        purpose: { in: acceptedConsentPurposes(input.purpose) },
        OR: [{ patientId: input.patientId }, { patientId: null }],
      },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
    prisma.whatsAppMessage.findFirst({
      where: {
        direction: "INBOUND",
        createdAt: { gte: new Date(Date.now() - SERVICE_WINDOW_MS) },
        conversation: { clinicId: input.clinicId, phone },
      },
      select: { id: true },
    }),
  ]);
  return { patient, conversation, consent, serviceWindowOpen: Boolean(windowMessage) };
}

async function approvedTemplate(input: QueuePatientWhatsAppInput) {
  if (!input.preferredTemplateName) return null;
  return prisma.whatsAppTemplate.findFirst({
    where: {
      clinicId: input.clinicId,
      name: input.preferredTemplateName,
      language: input.preferredTemplateLanguage || "en",
      status: "APPROVED",
    },
    select: { name: true, language: true },
  });
}

/**
 * Patient-facing WhatsApp messages enter one tenant-scoped, consent-governed,
 * idempotent outbox. The worker repeats the patient/phone/consent check at send
 * time, so a withdrawal after queueing cancels delivery.
 */
export async function queuePatientWhatsAppMessage(input: QueuePatientWhatsAppInput) {
  const phone = canonicalWhatsAppPhone(input.phone);
  if (!phone) throw new PatientWhatsAppPolicyError("The patient's WhatsApp number is invalid.", 400);
  if (!input.content.trim() || input.content.length > 4096) {
    throw new PatientWhatsAppPolicyError("Enter a WhatsApp message up to 4096 characters.", 400);
  }
  const now = new Date();
  const scheduledAt = input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : now;

  const [policy, template] = await Promise.all([
    currentPolicy(input, phone),
    approvedTemplate(input),
  ]);
  const phoneMatches = Boolean(
    policy.patient && canonicalWhatsAppPhone(policy.patient.phone) === phone,
  );
  if (!patientWhatsAppCanQueue({
    patientExists: Boolean(policy.patient),
    phoneMatches,
    conversationOptedOut: policy.conversation?.status === "OPTED_OUT",
    latestConsentStatus: policy.consent?.status,
    consentConfirmed: input.consentConfirmed,
  })) {
    if (!policy.patient || !phoneMatches) {
      throw new PatientWhatsAppPolicyError("The recipient must match an active patient in this clinic.");
    }
    if (policy.conversation?.status === "OPTED_OUT" || policy.consent?.status === "WITHDRAWN") {
      throw new PatientWhatsAppPolicyError("This patient has withdrawn WhatsApp consent. Ask them to send START before messaging again.");
    }
    throw new PatientWhatsAppPolicyError("Confirm the patient's current WhatsApp consent before queueing this message.");
  }
  const mustUseTemplate = !policy.serviceWindowOpen || scheduledAt > now;
  if (mustUseTemplate && !template) {
    throw new PatientWhatsAppPolicyError("An approved clinic WhatsApp utility template is required outside the 24-hour service window or for scheduled delivery.");
  }

  const idempotencyKey = patientWhatsAppIdempotencyKey(input.clinicId, input.idempotencyKey);
  const correlationId = crypto.randomUUID();
  const messageType = mustUseTemplate ? "TEMPLATE" : "TEXT";
  const storedContent = input.redactContent
    ? `${input.sourceType.replaceAll("_", " ").toLowerCase()} queued for private WhatsApp delivery.`
    : input.content;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.scheduledWhatsAppMessage.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          existing.clinicId !== input.clinicId
          || existing.patientId !== input.patientId
          || existing.phone !== phone
          || existing.purpose !== input.purpose
          || existing.sourceType !== input.sourceType
          || existing.sourceId !== input.sourceId
        ) {
          throw new PatientWhatsAppPolicyError("The delivery idempotency key belongs to a different patient message.");
        }
        return { message: existing, reused: true };
      }

      if (policy.consent?.status !== "GRANTED") {
        await tx.whatsAppConsentEvent.create({ data: {
          clinicId: input.clinicId,
          patientId: input.patientId,
          phone,
          purpose: input.purpose,
          status: "GRANTED",
          source: "STAFF_RECORDED",
          actorUserId: input.actorUserId,
          evidence: input.consentEvidence,
          correlationId,
        } });
      }
      const message = await tx.scheduledWhatsAppMessage.create({ data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        phone,
        content: storedContent,
        dispatchPayloadCiphertext: input.redactContent
          ? encryptSecureDispatchPayload({ content: input.content, templateParameters: input.templateParameters || [] })
          : null,
        messageType,
        templateName: messageType === "TEMPLATE" ? template!.name : null,
        templateLanguage: messageType === "TEMPLATE" ? template!.language : null,
        templateParameters: messageType === "TEMPLATE" && !input.redactContent ? (input.templateParameters || []) : Prisma.JsonNull,
        scheduledAt,
        status: "SCHEDULED",
        idempotencyKey,
        purpose: input.purpose,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        correlationId,
        createdByUserId: input.actorUserId,
      } });
      await tx.auditLog.create({ data: {
        clinicId: input.clinicId,
        userId: input.actorUserId,
        patientId: input.patientId,
        actorRole: input.actorRole,
        action: input.auditAction,
        entityType: input.sourceType,
        entityId: input.sourceId,
        detail: `Consent-governed ${messageType.toLowerCase()} added to the durable WhatsApp outbox`,
        source: "WHATSAPP",
        correlationId,
        afterState: { outboxId: message.id, purpose: input.purpose, scheduledAt },
      } });
      return { message, reused: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const existing = await prisma.scheduledWhatsAppMessage.findUnique({ where: { idempotencyKey } });
      if (
        existing
        && existing.clinicId === input.clinicId
        && existing.patientId === input.patientId
        && existing.phone === phone
        && existing.purpose === input.purpose
        && existing.sourceType === input.sourceType
        && existing.sourceId === input.sourceId
      ) return { message: existing, reused: true };
    }
    throw error;
  }
}
