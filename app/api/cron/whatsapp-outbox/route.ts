import { NextRequest, NextResponse } from "next/server";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, ...(await processScheduledWhatsAppMessages()) });
}
