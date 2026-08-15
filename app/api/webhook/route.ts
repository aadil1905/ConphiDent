import { createHmac, timingSafeEqual } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { resolveWhatsAppWebhookClinic } from "@/lib/whatsapp-connection";
import { normalizeWhatsAppWebhook } from "@/lib/whatsapp-webhook";
import {
  persistWhatsAppMessageWebhookEvent,
  persistWhatsAppStatusWebhookEvent,
  processWhatsAppWebhookEvent,
} from "@/lib/whatsapp-webhook-inbox";
import type {
  WhatsAppWebhookMessage,
  WhatsAppWebhookStatus,
} from "@/lib/whatsapp-webhook-inbox-core";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  if (
    mode === "subscribe"
    && challenge
    && token === process.env.VERIFY_TOKEN
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

function hasValidSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length
    && timingSafeEqual(received, expectedBuffer);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!hasValidSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return NextResponse.json(
        { error: "Unauthorized webhook request." },
        { status: 401 },
      );
    }
    const webhookEvents = normalizeWhatsAppWebhook(JSON.parse(rawBody));
    const actionableEvents = webhookEvents.filter(
      (event) => event.messages.length || event.statuses.length,
    );
    const routedEvents: Array<{
      event: (typeof webhookEvents)[number];
      clinicId: number;
      phoneNumberId: string;
    }> = [];

    let unroutable = 0;
    // Route each Meta change independently. One disconnected tenant must not
    // prevent valid events in the same signed batch from reaching the inbox.
    for (const event of actionableEvents) {
      if (!event.phoneNumberId) {
        unroutable += 1;
        continue;
      }
      const route = await resolveWhatsAppWebhookClinic(event.phoneNumberId);
      if (!route) {
        unroutable += 1;
        continue;
      }
      routedEvents.push({
        event,
        clinicId: route.clinicId,
        phoneNumberId: route.phoneNumberId,
      });
    }

    const inboxIds: string[] = [];
    // Security boundary delegation: the server-only persistence helpers below
    // execute prisma.whatsAppWebhookEvent.upsert before any workflow handler.
    for (const { event, clinicId, phoneNumberId } of routedEvents) {
      for (const status of event.statuses) {
        const inbox = await persistWhatsAppStatusWebhookEvent({
          clinicId,
          phoneNumberId,
          status: status as WhatsAppWebhookStatus,
        });
        if (inbox) inboxIds.push(inbox.id);
      }
      for (const wrapper of event.messages) {
        const inbox = await persistWhatsAppMessageWebhookEvent({
          clinicId,
          phoneNumberId,
          message: wrapper.message as WhatsAppWebhookMessage,
        });
        inboxIds.push(inbox.id);
      }
    }

    // Acknowledge immediately after durable persistence, then process the newly
    // claimed events in this invocation. The daily worker remains a recovery
    // sweep for transient failures and interrupted invocations on Vercel Hobby.
    after(async () => {
      for (const inboxId of inboxIds) {
        try {
          await processWhatsAppWebhookEvent(inboxId);
        } catch (error) {
          console.error("WhatsApp webhook post-response processing failed:", error);
        }
      }
    });

    return NextResponse.json({
      received: true,
      accepted: inboxIds.length,
      unroutable,
    });
  } catch (error) {
    console.error("WhatsApp webhook ingress failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to persist webhook." },
      { status: 500 },
    );
  }
}
