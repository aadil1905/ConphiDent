import { NextResponse } from "next/server";
import { requireApiFeature } from "@/lib/tenant";
import { isPatientWhatsAppPurpose } from "@/lib/patient-whatsapp-policy";
import { PatientWhatsAppPolicyError, queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";

export async function POST(request: Request) {
  const { user, response } = await requireApiFeature("whatsapp", "sendWhatsApp");
  if (!user) return response;
  const body = await request.json().catch(() => null) as { patientId?: number; phone?: string; message?: string; scheduledAt?: string; purpose?: string; sourceType?: string; sourceId?: string; idempotencyKey?: string; consentConfirmed?: boolean; templateName?: string; templateLanguage?: string; templateParameters?: string[] } | null;
  const patientId = Number(body?.patientId);
  const phone = String(body?.phone || "").replace(/\D/g, "");
  const message = String(body?.message || "").trim();
  const purpose = String(body?.purpose || "CARE_COMMUNICATION");
  const sourceType = String(body?.sourceType || "PATIENT_MESSAGE").trim().slice(0, 80);
  const sourceId = String(body?.sourceId || "").trim().slice(0, 120);
  const requestId = String(body?.idempotencyKey || request.headers.get("idempotency-key") || "").trim();
  if (!Number.isInteger(patientId) || patientId < 1 || phone.length < 8 || !message || message.length > 4096 || !isPatientWhatsAppPurpose(purpose) || !sourceType || !sourceId || requestId.length < 8) {
    return NextResponse.json({ error: "Choose a patient and provide a valid recipient, message, purpose, source, and idempotency key." }, { status: 400 });
  }
  const scheduledAt = body?.scheduledAt ? new Date(body.scheduledAt) : new Date();
  if (Number.isNaN(scheduledAt.getTime()) || (body?.scheduledAt && scheduledAt <= new Date())) return NextResponse.json({ error: "Choose a future delivery time." }, { status: 400 });
  try {
    const outcome = await queuePatientWhatsAppMessage({
      clinicId: user.clinicId,
      patientId,
      phone,
      content: message,
      purpose,
      sourceType,
      sourceId,
      idempotencyKey: requestId,
      actorUserId: user.id,
      actorRole: user.role,
      scheduledAt,
      consentConfirmed: body?.consentConfirmed === true,
      consentEvidence: "Staff confirmed the patient's current WhatsApp consent before sending a custom message",
      auditAction: "PATIENT_WHATSAPP_MESSAGE_QUEUED",
      preferredTemplateName: body?.templateName,
      preferredTemplateLanguage: body?.templateLanguage,
      templateParameters: Array.isArray(body?.templateParameters) ? body.templateParameters.filter((item): item is string => typeof item === "string") : [],
      redactContent: true,
    });
    return NextResponse.json({ ok: true, queued: true, reused: outcome.reused, id: outcome.message.id });
  } catch (error) {
    const status = error instanceof PatientWhatsAppPolicyError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Message could not be queued." }, { status });
  }
}
