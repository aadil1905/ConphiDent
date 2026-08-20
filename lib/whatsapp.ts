import { isWhatsAppContactOptedOut, recordOutboundMessage } from "./whatsapp-conversations";
import { currentWhatsAppClinicId, runWithWhatsAppClinic } from "./whatsapp-context";
import { decryptWhatsAppToken } from "./whatsapp-connection";
import { prisma } from "./prisma";
import { canonicalWhatsAppPhone } from "./phone";

export class WhatsAppDeliveryUncertainError extends Error {}
export class WhatsAppTemplateRequiredError extends Error {}

async function sendRequest(payload: Record<string, unknown>) {
  const clinicId = currentWhatsAppClinicId();
  if (!clinicId) throw new Error("A clinic-scoped WhatsApp context is required.");
  const connection = clinicId ? await prisma.clinicWhatsAppConnection.findFirst({ where: { clinicId, disconnectedAt: null, clinic: { status: "ACTIVE" } } }) : null;
  // Legacy credentials are explicitly scoped to the established clinic only; new clinics must use Embedded Signup.
  const legacyClinicId = Number(process.env.LEGACY_WHATSAPP_CLINIC_ID);
  const tenant = clinicId ? await prisma.clinic.findUnique({ where: { id: clinicId }, select: { status: true, featureEntitlements: { where: { featureKey: "whatsapp" }, select: { enabled: true }, take: 1 } } }) : null;
  if (clinicId && (!tenant || tenant.status !== "ACTIVE" || tenant.featureEntitlements[0]?.enabled === false)) throw new Error("WhatsApp is disabled for this clinic.");
  const mayUseLegacyConnection = Number.isInteger(legacyClinicId) && clinicId === legacyClinicId && tenant?.status === "ACTIVE";
  const phoneNumberId = connection?.phoneNumberId ?? (mayUseLegacyConnection ? process.env.PHONE_NUMBER_ID : undefined);
  const token = connection ? decryptWhatsAppToken(connection) : (mayUseLegacyConnection ? process.env.WHATSAPP_TOKEN : undefined);
  if (!phoneNumberId || !token) throw new Error("No WhatsApp connection is available for this clinic.");
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    if (connection) await prisma.whatsAppConnectionLog.create({ data: { clinicId: connection.clinicId, connectionId: connection.id, event: "MESSAGE_OUTCOME_UNKNOWN", detail: "Provider request ended without a definitive response; automatic resend is blocked" } }).catch(() => undefined);
    throw new WhatsAppDeliveryUncertainError("WhatsApp provider outcome is unknown. Verify delivery before retrying.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data;
  const message = getErrorMessage(data) || "Failed to send WhatsApp message";
  if (connection) await prisma.whatsAppConnectionLog.create({ data: { clinicId: connection.clinicId, connectionId: connection.id, event: "MESSAGE_SEND_FAILED", detail: `Meta returned HTTP ${response.status}: ${message.slice(0, 180)}` } });
  throw new Error(message);
}

function providerMessageId(result: unknown) {
  if (typeof result !== "object" || result === null || !("messages" in result)) return undefined;
  const messages = result.messages;
  if (!Array.isArray(messages) || typeof messages[0] !== "object" || messages[0] === null || !("id" in messages[0])) return undefined;
  return typeof messages[0].id === "string" ? messages[0].id : undefined;
}

async function recordOutboundSafely(to: string, content: string, messageType: string, messageId?: string) {
  try {
    await recordOutboundMessage(to, content, messageType, messageId);
  } catch (error) {
    // A CRM write failure must not cause Meta to retry and duplicate a delivered response.
    console.error("Unable to record outbound WhatsApp message:", error);
  }
}

async function withinClinic<T>(clinicId: number | undefined, work: () => Promise<T>) {
  return clinicId ? runWithWhatsAppClinic(clinicId, work) : work();
}

async function ensureContactCanReceiveWhatsApp(phone: string, requireOpenCustomerWindow = true) {
  if (await isWhatsAppContactOptedOut(phone)) {
    throw new Error("This WhatsApp contact has opted out. Ask them to send START before messaging again.");
  }
  if (!requireOpenCustomerWindow) return;
  const clinicId = currentWhatsAppClinicId();
  if (!clinicId) throw new Error("A clinic-scoped WhatsApp context is required.");
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentInbound = await prisma.whatsAppMessage.findFirst({
    where: {
      direction: "INBOUND",
      createdAt: { gte: cutoff },
      conversation: { clinicId, phone },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (!recentInbound) {
    throw new WhatsAppTemplateRequiredError("The 24-hour WhatsApp customer-service window is closed. Send an approved template instead.");
  }
}

export async function sendTextMessage(
  to: string,
  message: string,
  clinicId?: number,
  recordedContent?: string,
) {
  return withinClinic(clinicId, async () => {
  const canonicalTo = canonicalWhatsAppPhone(to);
  if (!canonicalTo) throw new Error("The recipient WhatsApp number is invalid.");
  await ensureContactCanReceiveWhatsApp(canonicalTo);
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: canonicalTo,
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  });
  await recordOutboundSafely(canonicalTo, recordedContent || message, "TEXT", providerMessageId(result));
  return result;
  });
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "en",
  bodyParameters: string[] = [],
  clinicId?: number,
) {
  return withinClinic(clinicId, async () => {
  const canonicalTo = canonicalWhatsAppPhone(to);
  if (!canonicalTo) throw new Error("The recipient WhatsApp number is invalid.");
  await ensureContactCanReceiveWhatsApp(canonicalTo, false);
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: canonicalTo,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      ...(bodyParameters.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          }
        : {}),
    },
  });
  await recordOutboundSafely(canonicalTo, `Template: ${templateName}`, "TEMPLATE", providerMessageId(result));
  return result;
  });
}

export async function sendReplyButtons(
  to: string,
  bodyText: string,
  buttons: {
    id: string;
    title: string;
  }[],
  clinicId?: number,
) {
  return withinClinic(clinicId, async () => {
  const canonicalTo = canonicalWhatsAppPhone(to);
  if (!canonicalTo) throw new Error("The recipient WhatsApp number is invalid.");
  await ensureContactCanReceiveWhatsApp(canonicalTo);
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: canonicalTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: bodyText,
      },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: button.id,
            title: button.title.substring(0, 20),
          },
        })),
      },
    },
  });
  await recordOutboundSafely(canonicalTo, bodyText, "INTERACTIVE", providerMessageId(result));
  return result;
  });
}

export async function sendListMessage(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: {
    title: string;
    rows: {
      id: string;
      title: string;
      description?: string;
    }[];
  }[],
  clinicId?: number,
) {
  return withinClinic(clinicId, async () => {
  const canonicalTo = canonicalWhatsAppPhone(to);
  if (!canonicalTo) throw new Error("The recipient WhatsApp number is invalid.");
  await ensureContactCanReceiveWhatsApp(canonicalTo);
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: canonicalTo,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: bodyText,
      },
      action: {
        button: buttonText.substring(0, 20),
        sections: sections.map((section) => ({
          title: section.title.substring(0, 24),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title.substring(0, 24),
            ...(row.description
              ? {
                  description: row.description.substring(0, 72),
                }
              : {}),
          })),
        })),
      },
    },
  });
  await recordOutboundSafely(canonicalTo, bodyText, "INTERACTIVE", providerMessageId(result));
  return result;
  });
}

function getErrorMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("error" in data)) return undefined;
  const error = data.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}
