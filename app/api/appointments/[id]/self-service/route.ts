import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

function responseLink(request: NextRequest, token: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return `${configured || request.nextUrl.origin}/appointment/${token}`;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { id } = await context.params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId < 1) {
    return NextResponse.json({ error: "Invalid appointment." }, { status: 400 });
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null, status: { notIn: ["Cancelled", "Completed"] } },
    select: { id: true, patientName: true, phone: true, appointmentDate: true, appointmentTime: true, treatment: true },
  });
  if (!appointment) return NextResponse.json({ error: "This appointment is not available for patient confirmation." }, { status: 404 });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const link = responseLink(request, token);
  const accessRequest = await prisma.$transaction(async (tx) => {
    await tx.appointmentSelfServiceRequest.updateMany({
      where: { appointmentId: appointment.id, clinicId: user.clinicId, status: "PENDING" },
      data: { status: "SUPERSEDED", expiresAt: new Date() },
    });
    return tx.appointmentSelfServiceRequest.create({
      data: { clinicId: user.clinicId, appointmentId: appointment.id, token, expiresAt },
    });
  });

  const date = appointment.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  try {
    const phone = appointment.phone.replace(/\D/g, "").slice(-10);
    await sendTextMessage(`91${phone}`, `Hello ${appointment.patientName}, please confirm your ${appointment.treatment} appointment on ${date} at ${appointment.appointmentTime}, or request another time using this secure link: ${link}`, user.clinicId);
    await prisma.appointmentSelfServiceRequest.update({ where: { id: accessRequest.id }, data: { sentAt: new Date() } });
  } catch (error) {
    return NextResponse.json({
      id: accessRequest.id,
      link,
      expiresAt,
      warning: error instanceof Error ? error.message : "The secure link was created but WhatsApp could not send it.",
    });
  }

  return NextResponse.json({ id: accessRequest.id, link, expiresAt, sent: true });
}
