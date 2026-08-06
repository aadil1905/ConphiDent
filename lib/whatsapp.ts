import { recordOutboundMessage } from "./whatsapp-conversations";
import { currentWhatsAppClinicId, runWithWhatsAppClinic } from "./whatsapp-context";
import { decryptWhatsAppToken } from "./whatsapp-connection";
import { prisma } from "./prisma";

async function sendRequest(payload: Record<string, unknown>) {
  const clinicId = currentWhatsAppClinicId();
  const connection = clinicId ? await prisma.clinicWhatsAppConnection.findUnique({ where: { clinicId } }) : null;
  // Legacy credentials are explicitly scoped to the established clinic only; new clinics must use Embedded Signup.
  const legacyClinicId = Number(process.env.LEGACY_WHATSAPP_CLINIC_ID);
  const mayUseLegacyConnection = !clinicId || (Number.isInteger(legacyClinicId) && clinicId === legacyClinicId);
  const phoneNumberId = connection?.phoneNumberId ?? (mayUseLegacyConnection ? process.env.PHONE_NUMBER_ID : undefined);
  const token = connection ? decryptWhatsAppToken(connection) : (mayUseLegacyConnection ? process.env.WHATSAPP_TOKEN : undefined);
  if (!phoneNumberId || !token) throw new Error("No WhatsApp connection is available for this clinic.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (attempt === 0) continue;
      if (connection) await prisma.whatsAppConnectionLog.create({ data: { clinicId: connection.clinicId, connectionId: connection.id, event: "MESSAGE_SEND_FAILED", detail: "Message delivery request failed after retry" } }).catch(() => undefined);
      throw error;
    }
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return data;
    // Retry only transient provider failures. Do not retry validation/authentication errors.
    if ((response.status === 429 || response.status >= 500) && attempt === 0) continue;
    const message = getErrorMessage(data) || "Failed to send WhatsApp message";
    if (connection) await prisma.whatsAppConnectionLog.create({ data: { clinicId: connection.clinicId, connectionId: connection.id, event: "MESSAGE_SEND_FAILED", detail: `Meta returned HTTP ${response.status}: ${message.slice(0, 180)}` } });
    throw new Error(message);
  }
  throw new Error("Failed to send WhatsApp message");
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

export async function sendTextMessage(
  to: string,
  message: string,
  clinicId?: number,
) {
  return withinClinic(clinicId, async () => {
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  });
  await recordOutboundSafely(to, message, "TEXT", providerMessageId(result));
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
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
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
  await recordOutboundSafely(to, `Template: ${templateName}`, "TEMPLATE", providerMessageId(result));
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
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
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
  await recordOutboundSafely(to, bodyText, "INTERACTIVE", providerMessageId(result));
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
  const result = await sendRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
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
  await recordOutboundSafely(to, bodyText, "INTERACTIVE", providerMessageId(result));
  return result;
  });
}

function getErrorMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("error" in data)) return undefined;
  const error = data.error;
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}
