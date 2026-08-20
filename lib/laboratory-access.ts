import "server-only";

import { labAttachmentAccessSignature, validLabAttachmentAccessSignature } from "@/lib/laboratory-access-core";

export function laboratoryAccessSecret() {
  const secret = process.env.LAB_PORTAL_SECRET || process.env.IMAGING_ACCESS_SECRET || process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("LAB_PORTAL_SECRET or AUTH_SECRET must be at least 32 characters.");
  return secret;
}

export function labPortalUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/lab/cases/${encodeURIComponent(token)}`;
}

export function signedLabAttachmentPath(attachmentId: string, scope: string, lifetimeSeconds = 300) {
  const expires = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(lifetimeSeconds, 600));
  const signature = labAttachmentAccessSignature(laboratoryAccessSecret(), attachmentId, scope, expires);
  return `/api/laboratory/attachments/${encodeURIComponent(attachmentId)}?scope=${encodeURIComponent(scope)}&expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

export function signedLabImagingPath(assetId: string, portalAccessId: string, lifetimeSeconds = 300) {
  const scope = `portal:${portalAccessId}`;
  const expires = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(lifetimeSeconds, 600));
  const signature = labAttachmentAccessSignature(laboratoryAccessSecret(), assetId, scope, expires);
  return `/api/laboratory/imaging/${encodeURIComponent(assetId)}?scope=${encodeURIComponent(scope)}&expires=${expires}&signature=${encodeURIComponent(signature)}`;
}

export function verifyLabAttachmentPath(attachmentId: string, scope: string, expiresValue: string | null, signature: string | null) {
  const expires = Number(expiresValue);
  return validLabAttachmentAccessSignature({ secret: laboratoryAccessSecret(), attachmentId, scope, expires, supplied: signature, now: Math.floor(Date.now() / 1000) });
}
