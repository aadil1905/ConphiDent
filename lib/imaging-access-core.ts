import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_IMAGING_ACCESS_LIFETIME_SECONDS = 10 * 60;

export function imagingAccessSignature(secret: string, assetId: string, clinicId: number, expires: number) {
  return createHmac("sha256", secret).update(`${assetId}.${clinicId}.${expires}`).digest("base64url");
}

export function validImagingAccessSignature(input: { secret: string; assetId: string; clinicId: number; expires: number; supplied: string; now: number }) {
  if (!Number.isInteger(input.expires) || input.expires <= input.now || input.expires > input.now + MAX_IMAGING_ACCESS_LIFETIME_SECONDS || !input.supplied) return false;
  const expected = Buffer.from(imagingAccessSignature(input.secret, input.assetId, input.clinicId, input.expires));
  const received = Buffer.from(input.supplied);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
