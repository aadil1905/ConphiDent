import { crossTenant } from "@/lib/tenant-guard";
import { NextRequest, NextResponse } from "next/server";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  try {
    const result = await crossTenant(() => processScheduledWhatsAppMessages());
    console.info(JSON.stringify({ event: "cron.completed", job: "whatsapp-outbox", ...result, durationMs: Date.now() - startedAt }));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error(JSON.stringify({ event: "cron.failed", job: "whatsapp-outbox", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown error" }));
    return NextResponse.json({ success: false, error: "WhatsApp outbox processing failed." }, { status: 503 });
  }
}
