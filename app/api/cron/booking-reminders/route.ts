import { NextRequest, NextResponse } from "next/server";
import { sendAbandonedBookingReminders } from "@/lib/booking";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");

  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const remindersSent = await sendAbandonedBookingReminders();
    console.info(JSON.stringify({ event: "cron.completed", job: "booking-reminders", remindersSent, durationMs: Date.now() - startedAt }));
    return NextResponse.json({ success: true, remindersSent });
  } catch (error) {
    console.error(JSON.stringify({ event: "cron.failed", job: "booking-reminders", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown error" }));
    return NextResponse.json({ success: false, error: "Booking reminders failed." }, { status: 503 });
  }
}
