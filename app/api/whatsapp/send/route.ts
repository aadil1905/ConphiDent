import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendTextMessage } from "@/lib/whatsapp";
import { scheduleWhatsAppMessage } from "@/lib/scheduled-whatsapp";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { phone?: string; message?: string; scheduledAt?: string } | null;
  const phone = String(body?.phone || "").replace(/\D/g, "");
  const message = String(body?.message || "").trim();
  if (phone.length < 8 || !message || message.length > 4096) return NextResponse.json({ error: "Enter a valid recipient and message." }, { status: 400 });
  if (body?.scheduledAt) {
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) return NextResponse.json({ error: "Choose a future delivery time." }, { status: 400 });
    const scheduled = await scheduleWhatsAppMessage({ clinicId: user.clinicId, phone, content: message, scheduledAt, createdByUserId: user.id });
    return NextResponse.json({ ok: true, scheduled: true, id: scheduled.id });
  }
  try {
    await sendTextMessage(phone, message, user.clinicId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Message could not be sent." }, { status: 502 });
  }
}
