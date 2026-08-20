/**
 * Canonicalize a WhatsApp/telephone identity without using suffix matching.
 * Meta sends E.164 digits; ten-digit local input is treated as Indian only for
 * compatibility with this product's legacy records.
 */
export function canonicalWhatsAppPhone(value: string, defaultCountryCode = "91") {
  let digits = value.normalize("NFKC").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  }
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Preserve the India-first 10-digit identity used by the legacy Patient table. */
export function canonicalPatientPhone(value: string) {
  const canonical = canonicalWhatsAppPhone(value);
  return canonical?.startsWith("91") && canonical.length === 12
    ? canonical.slice(2)
    : canonical;
}

export const MAX_WHATSAPP_INBOUND_AGE_MS = 10 * 60 * 1000;

export function whatsappProviderTimestamp(value: string | undefined) {
  if (!value || !/^(?:\d{10}|\d{13})$/.test(value)) return null;
  const milliseconds = Number(value) * (value.length === 10 ? 1000 : 1);
  const timestamp = new Date(milliseconds);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

export function isStaleWhatsAppMessage(
  value: string | undefined,
  now = new Date(),
  maxAgeMs = MAX_WHATSAPP_INBOUND_AGE_MS,
) {
  const timestamp = whatsappProviderTimestamp(value);
  return Boolean(timestamp && now.getTime() - timestamp.getTime() > maxAgeMs);
}
