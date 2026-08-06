import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";
import { requireApiPermission } from "@/lib/tenant";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiPermission("manageSchedule");
    if (!user) return response;
    const { id } = await context.params;
    const appointment = await prisma.appointment.findFirst({ where: { id: Number(id), clinicId: user.clinicId } });
    if (!appointment) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    if (appointment.status === "Cancelled") return NextResponse.json({ error: "A reminder cannot be sent for a cancelled appointment." }, { status: 400 });
    const date = appointment.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    await sendTextMessage(appointment.phone, `Hello ${appointment.patientName}, this is a friendly reminder of your ${appointment.treatment} appointment on ${date} at ${appointment.appointmentTime}. Reply here if you need help.`, user.clinicId);
    await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not send the WhatsApp reminder. Check your WhatsApp configuration and phone number." }, { status: 500 });
  }
}
