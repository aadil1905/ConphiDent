import "server-only";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";

/** Phase B: a week, not two days — long enough to survive a busy weekend. */
export const INTAKE_LINK_DAYS = 7;

export function intakeLinkFor(token: string, origin?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return `${configured || origin || ""}/intake/${token}`;
}

type SendArgs = {
  clinicId: number;
  clinicName: string;
  patientId: number;
  fullName: string;
  phone: string;
  actorUserId: number;
  actorRole: string;
  consentConfirmed: boolean;
  origin?: string;
};

/**
 * One place that mints an intake link and puts it on WhatsApp. Both the Patients
 * sheet and the Forms and consent card in Patient 360 come through here, so a
 * link never means two different things.
 */
export async function createAndSendIntakeLink(args: SendArgs) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INTAKE_LINK_DAYS * 24 * 60 * 60 * 1000);

  const intake = await prisma.patientIntakeRequest.create({
    data: { clinicId: args.clinicId, patientId: args.patientId, token, expiresAt },
  });
  const link = intakeLinkFor(token, args.origin);

  let warning = "";
  try {
    const queued = await queuePatientWhatsAppMessage({
      clinicId: args.clinicId,
      patientId: args.patientId,
      phone: args.phone,
      content: `Hello ${args.fullName}, ${args.clinicName} has sent you a short form to fill in before your visit. It takes about three minutes and the link works for ${INTAKE_LINK_DAYS} days:\n\n${link}`,
      purpose: "PATIENT_INTAKE",
      sourceType: "PATIENT_INTAKE",
      sourceId: String(intake.id),
      idempotencyKey: `patient-intake:${intake.id}`,
      actorUserId: args.actorUserId,
      actorRole: args.actorRole,
      consentConfirmed: args.consentConfirmed,
      consentEvidence:
        "Staff confirmed the patient agreed to receive the private intake link on this WhatsApp number",
      auditAction: "PATIENT_INTAKE_WHATSAPP_QUEUED",
      preferredTemplateName: process.env.WHATSAPP_INTAKE_TEMPLATE,
      preferredTemplateLanguage: process.env.WHATSAPP_INTAKE_TEMPLATE_LANG || "en",
      templateParameters: [args.fullName, link],
      redactContent: true,
    });
    await processScheduledWhatsAppMessages(new Date(), queued.message.id);
    const delivered = await prisma.scheduledWhatsAppMessage.findFirst({
      where: { id: queued.message.id, clinicId: args.clinicId },
      select: { status: true, failureReason: true },
    });
    if (delivered?.status === "SENT") {
      await prisma.patientIntakeRequest.update({
        where: { id: intake.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } else {
      warning = delivered?.failureReason || "The link is queued and waiting on WhatsApp.";
    }
  } catch (error) {
    warning = error instanceof Error ? error.message : "WhatsApp could not send the link.";
  }

  return { id: intake.id, link, expiresAt, warning };
}
