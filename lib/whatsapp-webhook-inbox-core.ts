import { createHash } from "crypto";

export const WHATSAPP_WEBHOOK_MAX_ATTEMPTS = 5;
export const WHATSAPP_WEBHOOK_PROCESSING_TIMEOUT_MS = 10 * 60_000;

export type WhatsAppWebhookMessage = {
  from?: string;
  type?: string;
  id?: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string; sha256?: string };
  document?: { id?: string; filename?: string; caption?: string; mime_type?: string; sha256?: string };
  audio?: { id?: string; mime_type?: string; sha256?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

export type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: { title?: string }[];
};

export function whatsappClinicCanProcessWebhook(
  status: string,
  explicitWhatsAppEntitlement?: boolean,
) {
  return status === "ACTIVE" && explicitWhatsAppEntitlement !== false;
}

export function messageWebhookProviderEventId(
  phoneNumberId: string,
  message: WhatsAppWebhookMessage,
) {
  if (message.id) return `message:${message.id}`;
  const digest = createHash("sha256")
    .update(`${phoneNumberId}:${JSON.stringify(message)}`)
    .digest("hex");
  return `message:${digest}`;
}

export function statusWebhookProviderEventId(status: WhatsAppWebhookStatus) {
  if (!status.id || !status.status) return null;
  return `status:${status.id}:${status.status}`;
}

export function whatsappWebhookRetryAt(attempts: number, now = new Date()) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMinutes * 60_000);
}

export function whatsappMediaMetadata(message: WhatsAppWebhookMessage) {
  const media = message.image ?? message.document ?? message.audio;
  if (!media) return null;
  const label = message.image
    ? "WhatsApp image"
    : message.document
      ? "WhatsApp document"
      : "WhatsApp voice note";
  const values = [
    `${label} metadata`,
    media.id ? `providerMediaId=${media.id}` : "providerMediaId=missing",
    message.document?.filename ? `filename=${message.document.filename}` : null,
    media.mime_type ? `mimeType=${media.mime_type}` : null,
    media.sha256 ? `sha256=${media.sha256}` : null,
    "retrievalStatus=NOT_CONFIGURED",
  ].filter(Boolean);
  return {
    content: values.join(" | "),
    patientReply: "Thank you. The attachment metadata reached the clinic, but file retrieval is not enabled yet, so the team cannot open this attachment from the inbox. Please describe the issue in text or contact the clinic directly. For urgent pain, swelling, bleeding, breathing difficulty, or injury, seek urgent dental care immediately.",
  };
}

export function emergencyNotificationDetail(
  conversationId: number,
  correlationId: string,
) {
  return `Conversation ${conversationId} reported an emergency keyword. Review immediately. Webhook correlation: ${correlationId}.`;
}
