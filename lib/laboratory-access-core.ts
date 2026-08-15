import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAX_LAB_ACCESS_LIFETIME_SECONDS = 10 * 60;

export function generateLabPortalToken() {
  return randomBytes(32).toString("base64url");
}

export function hashLabPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export function encryptLabPortalToken(secret: string, token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptLabPortalToken(secret: string, value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Invalid encrypted laboratory access token.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function labAttachmentAccessSignature(secret: string, attachmentId: string, scope: string, expires: number) {
  return createHmac("sha256", secret).update(`${attachmentId}:${scope}:${expires}`).digest("base64url");
}

export function validLabAttachmentAccessSignature(input: { secret: string; attachmentId: string; scope: string; expires: number; supplied: string | null; now: number }) {
  if (!Number.isInteger(input.expires) || input.expires <= input.now || input.expires > input.now + MAX_LAB_ACCESS_LIFETIME_SECONDS || !input.supplied) return false;
  const expected = Buffer.from(labAttachmentAccessSignature(input.secret, input.attachmentId, input.scope, input.expires));
  const supplied = Buffer.from(input.supplied);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

