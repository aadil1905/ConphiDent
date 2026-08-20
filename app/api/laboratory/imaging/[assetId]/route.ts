import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { verifyLabAttachmentPath } from "@/lib/laboratory-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const assetId = (await params).assetId;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "";
  if (!scope.startsWith("portal:") || !verifyLabAttachmentPath(assetId, scope, url.searchParams.get("expires"), url.searchParams.get("signature"))) return NextResponse.json({ error: "This imaging link is invalid or expired." }, { status: 401 });
  const accessId = scope.slice("portal:".length);
  const access = await prisma.labPortalAccess.findFirst({ where: { id: accessId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, clinicId: true, labCaseId: true } });
  if (!access) return NextResponse.json({ error: "Laboratory portal access is no longer valid." }, { status: 403 });
  const asset = await prisma.imagingAsset.findFirst({ where: { id: assetId, clinicId: access.clinicId, study: { labCaseLinks: { some: { labCaseId: access.labCaseId, clinicId: access.clinicId } }, archivedAt: null, enteredInErrorAt: null } }, select: { id: true, blobUrl: true, contentType: true, sizeBytes: true, originalName: true, study: { select: { patientId: true } } } });
  if (!asset) return NextResponse.json({ error: "Imaging reference not found." }, { status: 404 });
  const token = process.env.PRIVATE_CLINICAL_READ_WRITE_TOKEN || process.env.IMAGING_READ_WRITE_TOKEN || process.env.IMAGING_BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Private clinical storage is unavailable." }, { status: 503 });
  const blob = await get(asset.blobUrl, { access: "private", token });
  if (!blob) return NextResponse.json({ error: "Imaging reference is unavailable." }, { status: 404 });
  await prisma.auditLog.create({ data: { clinicId: access.clinicId, patientId: asset.study.patientId, actorRole: "LAB_PORTAL", action: "LAB_LINKED_IMAGING_ACCESSED", entityType: "IMAGING_ASSET", entityId: asset.id, source: "LAB_PORTAL", detail: `Minimum-necessary imaging accessed for lab case ${access.labCaseId}.` } }).catch(() => undefined);
  return new Response(blob.stream, { headers: { "Content-Type": asset.contentType, "Content-Length": String(asset.sizeBytes), "Content-Disposition": `inline; filename="${(asset.originalName || "imaging-reference").replace(/["\\\r\n]/g, "_")}"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
