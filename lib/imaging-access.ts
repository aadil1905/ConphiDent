import "server-only";

import { imagingAccessSignature, MAX_IMAGING_ACCESS_LIFETIME_SECONDS, validImagingAccessSignature } from "@/lib/imaging-access-core";

function secret() {
  const value = process.env.IMAGING_ACCESS_SECRET || process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("IMAGING_ACCESS_SECRET or AUTH_SECRET must be at least 32 characters.");
  return value;
}

export function signedImagingAssetPath(assetId: string, clinicId: number, lifetimeSeconds = 5 * 60) {
  const lifetime = Math.max(30, Math.min(lifetimeSeconds, MAX_IMAGING_ACCESS_LIFETIME_SECONDS));
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  return `/api/imaging/assets/${encodeURIComponent(assetId)}?expires=${expires}&signature=${imagingAccessSignature(secret(), assetId, clinicId, expires)}`;
}

export function verifyImagingAssetSignature(assetId: string, clinicId: number, expiresRaw: string | null, supplied: string | null) {
  const expires = Number(expiresRaw);
  const now = Math.floor(Date.now() / 1000);
  return validImagingAccessSignature({ secret: secret(), assetId, clinicId, expires, supplied: supplied || "", now });
}
