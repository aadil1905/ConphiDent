import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";
import { requireApiFeature } from "@/lib/tenant";

function responseLink(request: NextRequest, token: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return `${configured || request.nextUrl.origin}/appointment/${token}`;
}

function responseToken(clinicId: number, appointmentId: number, requestId: string) {
  const secret = process.env.SECURE_DELIVERY_ENCRYPTION_KEY || process.env.WHATSAPP_CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) throw new Error("Secure delivery encryption is not configured.");
  return createHmac("sha256", secret).update(`${clinicId}:${appointmentId}:${requestId}`).digest("hex");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireApiFeature("whatsapp", "sendWhatsApp");
  if (!user) return response;

  const { id } = await context.params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId < 1) {
    return NextResponse.json(
      { error: "Invalid appointment." },
      { status: 400 },
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId: user.clinicId,
      archivedAt: null,
      status: { notIn: ["Cancelled", "Completed"] },
    },
    select: {
      id: true,
      patientName: true,
      phone: true,
      appointmentDate: true,
      appointmentTime: true,
      treatment: true,
      patientId: true,
    },
  });
  if (!appointment)
    return NextResponse.json(
      { error: "This appointment is not available for patient confirmation." },
      { status: 404 },
    );

  if (!appointment.patientId) return NextResponse.json({ error: "Link this appointment to an active patient before sending WhatsApp." }, { status: 409 });
  const body = await request.json().catch(() => null) as { consentConfirmed?: boolean } | null;
  const requestId = String(request.headers.get("idempotency-key") || "").trim();
  if (requestId.length < 8) return NextResponse.json({ error: "A delivery idempotency key is required." }, { status: 400 });
  const token = responseToken(user.clinicId, appointment.id, requestId);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const link = responseLink(request, token);
  const accessRequest = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointmentSelfServiceRequest.findUnique({ where: { token } });
    if (existing) {
      if (existing.clinicId !== user.clinicId || existing.appointmentId !== appointment.id) throw new Error("The response-link request identifier is unavailable.");
      return existing;
    }
    await tx.appointmentSelfServiceRequest.updateMany({
      where: {
        appointmentId: appointment.id,
        clinicId: user.clinicId,
        status: "PENDING",
      },
      data: { status: "SUPERSEDED", expiresAt: new Date() },
    });
    return tx.appointmentSelfServiceRequest.create({
      data: {
        clinicId: user.clinicId,
        appointmentId: appointment.id,
        token,
        expiresAt,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    const queued = await queuePatientWhatsAppMessage({
      clinicId: user.clinicId,
      patientId: appointment.patientId,
      phone: appointment.phone,
      content: `Hello ${appointment.patientName}, ${user.clinic.brandName || user.clinic.name} sent you a private appointment response request. Confirm or request another time within 72 hours: ${link}`,
      purpose: "APPOINTMENT_COMMUNICATION",
      sourceType: "APPOINTMENT_SELF_SERVICE",
      sourceId: String(accessRequest.id),
      idempotencyKey: `appointment-response:${appointment.id}:${requestId}`,
      actorUserId: user.id,
      actorRole: user.role,
      consentConfirmed: body?.consentConfirmed === true,
      consentEvidence: "Staff confirmed the patient agreed to receive appointment communication on this WhatsApp number",
      auditAction: "APPOINTMENT_RESPONSE_WHATSAPP_QUEUED",
      preferredTemplateName: process.env.WHATSAPP_APPOINTMENT_RESPONSE_TEMPLATE,
      preferredTemplateLanguage: process.env.WHATSAPP_APPOINTMENT_RESPONSE_TEMPLATE_LANG || "en",
      templateParameters: [appointment.patientName, link],
      redactContent: true,
    });
    await processScheduledWhatsAppMessages(new Date(), queued.message.id);
    const delivered = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id: queued.message.id, clinicId: user.clinicId }, select: { status: true, failureReason: true } });
    if (delivered?.status !== "SENT") throw new Error(delivered?.failureReason || "The response link is queued and awaiting WhatsApp delivery.");
    await prisma.appointmentSelfServiceRequest.updateMany({ where: { id: accessRequest.id, clinicId: user.clinicId }, data: { sentAt: new Date() } });
  } catch (error) {
    return NextResponse.json({
      id: accessRequest.id,
      link,
      expiresAt,
      warning:
        error instanceof Error
          ? error.message
          : "The secure link was created but WhatsApp could not send it.",
    });
  }

  return NextResponse.json({
    id: accessRequest.id,
    link,
    expiresAt,
    sent: true,
  });
}
