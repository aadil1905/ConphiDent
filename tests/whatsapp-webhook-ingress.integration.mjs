import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emergencyNotificationDetail,
  messageWebhookProviderEventId,
  whatsappClinicCanProcessWebhook,
  whatsappMediaMetadata,
  whatsappWebhookRetryAt,
} from "../lib/whatsapp-webhook-inbox-core.ts";

const root = process.cwd();
const source = (path) => readFileSync(`${root}/${path}`, "utf8");

test("inactive and explicitly disabled clinics fail the webhook eligibility gate", () => {
  assert.equal(whatsappClinicCanProcessWebhook("SUSPENDED", true), false);
  assert.equal(whatsappClinicCanProcessWebhook("ACTIVE", false), false);
  assert.equal(whatsappClinicCanProcessWebhook("ACTIVE", undefined), true);
});

test("provider message IDs are stable and fallback hashes remain phone scoped", () => {
  assert.equal(messageWebhookProviderEventId("phone-a", { id: "wamid.1" }), "message:wamid.1");
  const first = messageWebhookProviderEventId("phone-a", { from: "919999999999", type: "text", text: { body: "hello" } });
  const replay = messageWebhookProviderEventId("phone-a", { from: "919999999999", type: "text", text: { body: "hello" } });
  const otherTenant = messageWebhookProviderEventId("phone-b", { from: "919999999999", type: "text", text: { body: "hello" } });
  assert.equal(first, replay);
  assert.notEqual(first, otherTenant);
});

test("media metadata is durable and the patient response is transparent", () => {
  const media = whatsappMediaMetadata({
    type: "document",
    document: {
      id: "media-123",
      filename: "scan.pdf",
      mime_type: "application/pdf",
      sha256: "digest",
    },
  });
  assert.match(media.content, /providerMediaId=media-123/);
  assert.match(media.content, /filename=scan\.pdf/);
  assert.match(media.content, /retrievalStatus=NOT_CONFIGURED/);
  assert.match(media.patientReply, /cannot open this attachment/);
  assert.doesNotMatch(media.patientReply, /team will review/i);
});

test("webhook retry backoff is bounded", () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  assert.equal(whatsappWebhookRetryAt(1, now).toISOString(), "2030-01-01T00:01:00.000Z");
  assert.equal(whatsappWebhookRetryAt(20, now).toISOString(), "2030-01-01T01:00:00.000Z");
});

test("emergency notification correlation is deterministic for replay", () => {
  const first = emergencyNotificationDetail(42, "wamid.emergency");
  assert.equal(first, emergencyNotificationDetail(42, "wamid.emergency"));
  assert.match(first, /wamid\.emergency/);
});

test("ingress isolates routing failures and acknowledges after durable persistence", () => {
  const route = source("app/api/webhook/route.ts");
  const resolveIndex = route.indexOf("resolveWhatsAppWebhookClinic");
  const persistIndex = route.indexOf("persistWhatsAppStatusWebhookEvent({");
  assert.ok(resolveIndex >= 0 && persistIndex > resolveIndex);
  assert.match(route, /unroutable \+= 1/);
  assert.match(route, /Acknowledge immediately after durable persistence/);
  assert.doesNotMatch(route, /consumeRateLimit/);
  assert.doesNotMatch(route, /processWhatsAppWebhookEvent\(id\)/);
});

test("delivery status updates fail closed and include the routed clinic predicate", () => {
  const conversations = source("lib/whatsapp-conversations.ts");
  assert.match(conversations, /const clinicId = currentWhatsAppClinicId\(\)/);
  assert.match(conversations, /A clinic-scoped WhatsApp context is required to update delivery status/);
  assert.match(conversations, /where: \{ providerMessageId, conversation: \{ clinicId \} \}/);
  assert.match(conversations, /eventTime < message\.statusUpdatedAt/);
  assert.match(conversations, /deliveryStatusRank/);
  assert.match(conversations, /retry status processing later/);
  assert.doesNotMatch(conversations, /where: \{ providerMessageId \},/);
});

test("inbox worker uses an atomic PENDING to PROCESSING claim and stale recovery", () => {
  const inbox = source("lib/whatsapp-webhook-inbox.ts");
  assert.match(inbox, /status: "PENDING",[\s\S]*availableAt: \{ lte: now \}/);
  assert.match(inbox, /data: \{ status: "PROCESSING", attempts: \{ increment: 1 \} \}/);
  assert.match(inbox, /Recovered after an interrupted webhook worker/);
  assert.match(inbox, /triggerType: "EMERGENCY_AUTO_REPLY"/);
  assert.match(inbox, /emergencyNotificationDetail/);
});

test("webhook processes persisted events after the response and retains protected recovery", () => {
  const webhook = source("app/api/webhook/route.ts");
  assert.match(webhook, /import \{ after, NextRequest, NextResponse \} from "next\/server"/);
  assert.match(webhook, /after\(async \(\) => \{[\s\S]*processWhatsAppWebhookEvent\(inboxId\)/);
  const vercel = JSON.parse(source("vercel.json"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/cron/whatsapp-outbox/inbox" && cron.schedule === "0 0 * * *"));
  const cron = source("app/api/cron/whatsapp-outbox/inbox/route.ts");
  assert.match(cron, /Bearer \$\{expected\}/);
  assert.match(cron, /processPendingWhatsAppWebhookEvents/);
});

test("runtime automation pause, customer window, and uncertain delivery are enforced", () => {
  const inbox = source("lib/whatsapp-webhook-inbox.ts");
  const transport = source("lib/whatsapp.ts");
  assert.match(inbox, /isWhatsAppInboundAutomationEnabled\(conversation\.clinicId\)/);
  assert.match(inbox, /WhatsAppDeliveryUncertainError/);
  assert.match(transport, /The 24-hour WhatsApp customer-service window is closed/);
  assert.match(transport, /direction: "INBOUND"/);
});
