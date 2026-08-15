import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { whatsappClinicCanProcessWebhook } from "@/lib/whatsapp-webhook-inbox-core";

const GRAPH_VERSION = "v25.0";

function encryptionKey() {
  const value = process.env.WHATSAPP_CREDENTIAL_ENCRYPTION_KEY;
  if (!value) throw new Error("WhatsApp credential encryption is not configured.");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("WHATSAPP_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptWhatsAppToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { tokenCiphertext: ciphertext.toString("base64"), tokenIv: iv.toString("base64"), tokenTag: cipher.getAuthTag().toString("base64") };
}

export function decryptWhatsAppToken(connection: { tokenCiphertext: string; tokenIv: string; tokenTag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(connection.tokenIv, "base64"));
  decipher.setAuthTag(Buffer.from(connection.tokenTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(connection.tokenCiphertext, "base64")), decipher.final()]).toString("utf8");
}

async function graph(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(graphError(body) ?? "Meta could not complete WhatsApp onboarding.");
  return body;
}

async function logConnection(clinicId: number, event: string, detail?: string, connectionId?: number) {
  await prisma.whatsAppConnectionLog.create({ data: { clinicId, connectionId, event, detail } });
}

function graphError(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  const error = body.error;
  return error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : undefined;
}

export async function completeEmbeddedSignup(input: { code: string; clinicId: number; wabaId: string; phoneNumberId: string; businessId?: string }) {
  const appId = process.env.META_APP_ID;
  // WHATSAPP_APP_SECRET is the established webhook name for the same Meta App Secret.
  const appSecret = process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta Embedded Signup is not configured by the platform owner.");

  const exchange = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, code: input.code })}`, { cache: "no-store" });
  const exchanged = await exchange.json() as { access_token?: string; error?: { message?: string } };
  if (!exchange.ok || !exchanged.access_token) throw new Error(exchanged.error?.message ?? "Meta did not return an access token.");

  const phone = await graph(`/${input.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier`, exchanged.access_token) as { id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string };
  if (phone.id !== input.phoneNumberId) throw new Error("Meta returned a phone number that does not match this signup session.");
  await graph(`/${input.wabaId}/subscribed_apps`, exchanged.access_token, { method: "POST" });

  const encrypted = encryptWhatsAppToken(exchanged.access_token);
  const connection = await prisma.clinicWhatsAppConnection.upsert({
    where: { clinicId: input.clinicId },
    create: { clinicId: input.clinicId, wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, businessId: input.businessId, displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating, messagingLimit: phone.messaging_limit_tier, ...encrypted, lastVerifiedAt: new Date(), webhookVerifiedAt: new Date(), lastSyncedAt: new Date() },
    update: { wabaId: input.wabaId, phoneNumberId: input.phoneNumberId, businessId: input.businessId, displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating, messagingLimit: phone.messaging_limit_tier, ...encrypted, connectedAt: new Date(), lastVerifiedAt: new Date(), webhookVerifiedAt: new Date(), lastSyncedAt: new Date(), disconnectedAt: null },
  });
  await logConnection(input.clinicId, "CONNECTED", "Meta Embedded Signup completed", connection.id);
}

export async function syncWhatsAppConnection(clinicId: number) {
  const connection = await prisma.clinicWhatsAppConnection.findUnique({ where: { clinicId } });
  if (!connection || connection.disconnectedAt) throw new Error("No active WhatsApp connection is available for this clinic.");
  const token = decryptWhatsAppToken(connection);
  const [phone, business] = await Promise.all([
    graph(`/${connection.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`, token) as Promise<{ display_phone_number?: string; verified_name?: string; quality_rating?: string; messaging_limit_tier?: string }>,
    connection.businessId ? graph(`/${connection.businessId}?fields=name`, token).catch(() => null) as Promise<{ name?: string } | null> : Promise.resolve(null),
  ]);
  const updated = await prisma.clinicWhatsAppConnection.update({ where: { id: connection.id }, data: { displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating, messagingLimit: phone.messaging_limit_tier, businessName: business?.name, lastVerifiedAt: new Date(), lastSyncedAt: new Date(), webhookVerifiedAt: new Date() } });
  await logConnection(clinicId, "SYNCED", "Connection details refreshed from Meta", updated.id);
  return updated;
}

export async function disconnectWhatsAppConnection(clinicId: number) {
  const connection = await prisma.clinicWhatsAppConnection.findUnique({ where: { clinicId } });
  if (!connection || connection.disconnectedAt) return;
  await prisma.clinicWhatsAppConnection.update({ where: { id: connection.id }, data: { disconnectedAt: new Date() } });
  await logConnection(clinicId, "DISCONNECTED", "Disconnected by clinic owner", connection.id);
}

export async function logWhatsAppTest(clinicId: number) {
  const connection = await prisma.clinicWhatsAppConnection.findUnique({ where: { clinicId } });
  await logConnection(clinicId, "TEST_MESSAGE_SENT", "Clinic owner sent a test message", connection?.id);
}

export async function connectionForPhoneNumberId(phoneNumberId: string) {
  const connection = await prisma.clinicWhatsAppConnection.findUnique({
    where: { phoneNumberId },
    include: {
      clinic: {
        select: {
          status: true,
          featureEntitlements: {
            where: { featureKey: "whatsapp" },
            select: { enabled: true },
            take: 1,
          },
        },
      },
    },
  });
  if (
    !connection
    || connection.disconnectedAt
    || !whatsappClinicCanProcessWebhook(
      connection.clinic.status,
      connection.clinic.featureEntitlements[0]?.enabled,
    )
  ) return null;
  return connection;
}

export type WhatsAppWebhookClinicRoute = {
  clinicId: number;
  phoneNumberId: string;
  source: "EMBEDDED" | "LEGACY";
};

/** Resolve a Meta phone ID only when its clinic can legally execute automation. */
export async function resolveWhatsAppWebhookClinic(
  phoneNumberId: string,
): Promise<WhatsAppWebhookClinicRoute | null> {
  // A stored connection takes precedence over environment fallback. In
  // particular, an explicitly disconnected stored connection must stay off.
  const stored = await prisma.clinicWhatsAppConnection.findUnique({
    where: { phoneNumberId },
    include: {
      clinic: {
        select: {
          status: true,
          featureEntitlements: {
            where: { featureKey: "whatsapp" },
            select: { enabled: true },
            take: 1,
          },
        },
      },
    },
  });
  if (stored) {
    if (
      stored.disconnectedAt
      || !whatsappClinicCanProcessWebhook(
        stored.clinic.status,
        stored.clinic.featureEntitlements[0]?.enabled,
      )
    ) return null;
    return { clinicId: stored.clinicId, phoneNumberId, source: "EMBEDDED" };
  }

  const legacyPhoneNumberId = process.env.PHONE_NUMBER_ID;
  const legacyClinicId = Number(process.env.LEGACY_WHATSAPP_CLINIC_ID);
  if (
    phoneNumberId !== legacyPhoneNumberId
    || !Number.isInteger(legacyClinicId)
    || legacyClinicId <= 0
  ) return null;
  const legacyClinic = await prisma.clinic.findUnique({
    where: { id: legacyClinicId },
    select: {
      status: true,
      featureEntitlements: {
        where: { featureKey: "whatsapp" },
        select: { enabled: true },
        take: 1,
      },
    },
  });
  if (
    !legacyClinic
    || !whatsappClinicCanProcessWebhook(
      legacyClinic.status,
      legacyClinic.featureEntitlements[0]?.enabled,
    )
  ) return null;
  return { clinicId: legacyClinicId, phoneNumberId, source: "LEGACY" };
}
