import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { verifyLabAttachmentPath } from "@/lib/laboratory-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";

function storageToken() {
  return process.env.PRIVATE_CLINICAL_READ_WRITE_TOKEN || process.env.IMAGING_READ_WRITE_TOKEN || process.env.IMAGING_BLOB_READ_WRITE_TOKEN;
}

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const attachmentId = (await params).attachmentId;
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "";
  if (!verifyLabAttachmentPath(attachmentId, scope, url.searchParams.get("expires"), url.searchParams.get("signature"))) return NextResponse.json({ error: "This attachment link is invalid or expired." }, { status: 401 });
  const attachment = await prisma.labCaseAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  if (scope.startsWith("clinic:")) {
    const user = await getCurrentUser();
    if (!user || user.clinicId !== attachment.clinicId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!can(user.role, "manageLaboratory") && !can(user.role, "viewClinical")) return NextResponse.json({ error: "You do not have permission to view this attachment." }, { status: 403 });
  } else if (scope.startsWith("portal:")) {
    const accessId = scope.slice("portal:".length);
    const access = await prisma.labPortalAccess.findFirst({ where: { id: accessId, clinicId: attachment.clinicId, labCaseId: attachment.labCaseId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!access) return NextResponse.json({ error: "Laboratory portal access is no longer valid." }, { status: 403 });
  } else return NextResponse.json({ error: "Unsupported attachment scope." }, { status: 403 });
  const token = storageToken();
  if (!token) return NextResponse.json({ error: "Private clinical storage is unavailable." }, { status: 503 });
  const blob = await get(attachment.blobUrl, { access: "private", token });
  if (!blob) return NextResponse.json({ error: "Attachment is unavailable." }, { status: 404 });
  await prisma.auditLog.create({ data: { clinicId: attachment.clinicId, patientId: (await prisma.labCase.findUnique({ where: { id: attachment.labCaseId }, select: { patientId: true } }))?.patientId, actorRole: scope.startsWith("portal:") ? "LAB_PORTAL" : "CLINIC_USER", action: "LAB_ATTACHMENT_ACCESSED", entityType: "LAB_CASE_ATTACHMENT", entityId: attachment.id, source: scope.startsWith("portal:") ? "LAB_PORTAL" : "APPLICATION" } }).catch(() => undefined);
  return new Response(blob.stream, { headers: { "Content-Type": attachment.contentType, "Content-Length": String(attachment.sizeBytes), "Content-Disposition": `inline; filename="${attachment.originalName.replace(/["\\\r\n]/g, "_")}"`, "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
