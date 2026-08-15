import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";
import { verifyImagingAssetSignature } from "@/lib/imaging-access";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { user, response } = await requireApiFeature("imaging", "viewImaging");
  if (!user) return response!;
  const assetId = (await params).assetId;
  const url = new URL(request.url);
  if (!verifyImagingAssetSignature(assetId, user.clinicId, url.searchParams.get("expires"), url.searchParams.get("signature"))) {
    return NextResponse.json({ error: "This imaging access link is invalid or has expired." }, { status: 401 });
  }
  const token = process.env.IMAGING_READ_WRITE_TOKEN || process.env.IMAGING_BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Private imaging storage is not configured." }, { status: 503 });
  const asset = await prisma.imagingAsset.findFirst({
    where: { id: assetId, clinicId: user.clinicId, study: { archivedAt: null, enteredInErrorAt: null } },
    select: { id: true, studyId: true, blobUrl: true, contentType: true, sizeBytes: true, role: true, study: { select: { patientId: true } } },
  });
  if (!asset) return NextResponse.json({ error: "Imaging object not found." }, { status: 404 });
  const blob = await get(asset.blobUrl, { access: "private", token });
  if (!blob) return NextResponse.json({ error: "The stored imaging object is unavailable." }, { status: 404 });
  await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: asset.study.patientId, actorRole: user.role, action: "IMAGING_ASSET_ACCESSED", entityType: "IMAGING_ASSET", entityId: asset.id, detail: `Authenticated access to ${asset.role.toLowerCase()} asset for study ${asset.studyId}` } });
  return new Response(blob.stream, {
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.sizeBytes),
      "Content-Disposition": `inline; filename="imaging-${asset.role.toLowerCase()}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
