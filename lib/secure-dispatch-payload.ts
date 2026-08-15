import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function dispatchKey() {
  const configured = process.env.SECURE_DELIVERY_ENCRYPTION_KEY || process.env.WHATSAPP_CREDENTIAL_ENCRYPTION_KEY;
  if (!configured) throw new Error("Secure delivery encryption is not configured.");
  return createHash("sha256").update(configured).digest();
}

export function encryptSecureDispatchPayload(value: { content: string; templateParameters: string[] }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dispatchKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecureDispatchPayload(value: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Secure delivery payload is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", dispatchKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || !("content" in parsed) || typeof parsed.content !== "string" || !("templateParameters" in parsed) || !Array.isArray(parsed.templateParameters) || !parsed.templateParameters.every((item) => typeof item === "string")) throw new Error("Secure delivery payload has an invalid shape.");
  return parsed as { content: string; templateParameters: string[] };
}
