import { reportError } from "@/lib/monitoring";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";
import { requireApiFeature } from "@/lib/tenant";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiFeature("whatsapp", "sendWhatsApp");
    if (!user) return response;
    const { id } = await context.params;
    const appointment = await prisma.appointment.findFirst({ where: { id: Number(id), clinicId: user.clinicId } });
    if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    if (appointment.status === "Cancelled") return NextResponse.json({ error: "A reminder cannot be sent for a cancelled appointment." }, { status: 400 });
    if (!appointment.patientId) return NextResponse.json({ error: "Link this appointment to an active patient before sending WhatsApp." }, { status: 409 });
    const body = await request.json().catch(() => null) as { consentConfirmed?: boolean } | null;
    const requestId = String(request.headers.get("idempotency-key") || "").trim();
    if (requestId.length < 8) return NextResponse.json({ error: "A delivery idempotency key is required." }, { status: 400 });
    const date = appointment.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const queued = await queuePatientWhatsAppMessage({
      clinicId: user.clinicId,
      patientId: appointment.patientId,
      phone: appointment.phone,
      content: `Hello ${appointment.patientName}, this is a reminder from ${user.clinic.brandName || user.clinic.name} for your appointment on ${date} at ${appointment.appointmentTime}. Reply here if you need help.`,
      purpose: "APPOINTMENT_COMMUNICATION",
      sourceType: "APPOINTMENT_REMINDER",
      sourceId: String(appointment.id),
      idempotencyKey: `appointment-reminder:${appointment.id}:${requestId}`,
      actorUserId: user.id,
      actorRole: user.role,
      consentConfirmed: body?.consentConfirmed === true,
      consentEvidence: "Staff confirmed the patient agreed to receive appointment reminders on this WhatsApp number",
      auditAction: "APPOINTMENT_REMINDER_WHATSAPP_QUEUED",
      preferredTemplateName: process.env.WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE,
      preferredTemplateLanguage: process.env.WHATSAPP_APPOINTMENT_REMINDER_TEMPLATE_LANG || "en",
      templateParameters: [appointment.patientName, date, appointment.appointmentTime],
      redactContent: true,
    });
    await processScheduledWhatsAppMessages(new Date(), queued.message.id);
    const delivered = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id: queued.message.id, clinicId: user.clinicId }, select: { status: true, failureReason: true } });
    if (delivered?.status !== "SENT") return NextResponse.json({ error: delivered?.failureReason || "The reminder is queued and awaiting WhatsApp delivery.", queued: true }, { status: 503 });
    await prisma.appointment.updateMany({ where: { id: appointment.id, clinicId: user.clinicId }, data: { reminderSentAt: new Date() } });
    return NextResponse.json({ success: true, sent: true, outboxId: queued.message.id });
  } catch (error) {
    await reportError(error, { where: "api/appointments/[id]/reminder" });
    return NextResponse.json({ error: "Could not send the WhatsApp reminder. Check your WhatsApp configuration and phone number." }, { status: 500 });
  }
}
