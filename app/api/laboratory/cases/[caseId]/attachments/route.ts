import { createHash, randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { MAX_LAB_ATTACHMENT_BYTES, sniffLabAttachment } from "@/lib/laboratory-core";
import { resolveLabPortalAccess } from "@/lib/laboratory-portal";
import { scanImagingObject } from "@/lib/imaging-scan";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";

export const runtime = "nodejs";

function storageToken() {
  return process.env.PRIVATE_CLINICAL_READ_WRITE_TOKEN || process.env.IMAGING_READ_WRITE_TOKEN || process.env.IMAGING_BLOB_READ_WRITE_TOKEN;
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const caseId = Number((await params).caseId);
  if (!Number.isInteger(caseId) || caseId < 1) return NextResponse.json({ error: "Invalid laboratory case." }, { status: 400 });
  const portalToken = request.headers.get("authorization")?.match(/^LabPortal\s+(.+)$/)?.[1] || null;
  const portalAccess = portalToken ? await resolveLabPortalAccess(portalToken) : null;
  let clinicId: number;
  let userId: number | null = null;
  let actorName: string;
  let actorRole: string;
  if (portalAccess) {
    if (portalAccess.labCaseId !== caseId) return NextResponse.json({ error: "This portal link cannot access the requested case." }, { status: 403 });
    clinicId = portalAccess.clinicId;
    actorName = portalAccess.contactName || portalAccess.laboratory.name;
    actorRole = "LAB_PORTAL";
  } else {
    const { user, response } = await requireApiFeature("laboratory", "manageLaboratory");
    if (!user) return response!;
    clinicId = user.clinicId;
    userId = user.id;
    actorName = user.fullName;
    actorRole = user.role;
  }
  const token = storageToken();
  if (!token) return NextResponse.json({ error: "Private clinical storage is not configured." }, { status: 503 });
  const labCase = await prisma.labCase.findFirst({ where: { id: caseId, clinicId, cancelledAt: null }, select: { id: true, publicId: true, patientId: true, encounterId: true } });
  if (!labCase) return NextResponse.json({ error: "Laboratory case not found." }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("file");
  const category = String(formData.get("category") || "DOCUMENT");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_LAB_ATTACHMENT_BYTES) return NextResponse.json({ error: "Choose a JPEG, PNG, PDF, STL, PLY, or OBJ file up to 25 MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffLabAttachment(bytes, file.name);
  if (!detected) return NextResponse.json({ error: "The file signature does not match a supported laboratory attachment." }, { status: 400 });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const duplicate = await prisma.labCaseAttachment.findFirst({ where: { clinicId, labCaseId: caseId, sha256 }, select: { id: true } });
  if (duplicate) return NextResponse.json({ error: "This exact attachment is already on the case.", attachmentId: duplicate.id }, { status: 409 });
  let scan: Awaited<ReturnType<typeof scanImagingObject>>;
  try { scan = await scanImagingObject(bytes, detected.contentType, sha256); }
  catch { return NextResponse.json({ error: "File safety validation is temporarily unavailable. Nothing was stored." }, { status: 503 }); }
  if (scan.status === "MALWARE_DETECTED") return NextResponse.json({ error: "The file failed safety validation and was not stored." }, { status: 422 });
  const key = `clinical/laboratory/${clinicId}/${labCase.publicId}/${randomUUID()}.${detected.extension}`;
  let blob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    blob = await put(key, file, { access: "private", contentType: detected.contentType, addRandomSuffix: false, token });
    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.labCaseAttachment.create({ data: { clinicId, labCaseId: caseId, uploadedByUserId: userId, portalAccessId: portalAccess?.id || null, category: ["DOCUMENT", "PHOTOGRAPH", "DESIGN_PREVIEW", "INTRAORAL_SCAN", "STAGE_EVIDENCE"].includes(category) ? category : "DOCUMENT", storageKey: blob!.pathname, blobUrl: blob!.url, contentType: detected.contentType, originalName: file.name.slice(0, 255), sizeBytes: file.size, sha256, scanStatus: scan.engine ? `${scan.status}:${scan.engine}` : scan.status } });
      await tx.labCaseEvent.create({ data: { clinicId, labCaseId: caseId, type: "ATTACHMENT_ADDED", actorName, actorType: portalAccess ? "LAB" : "CLINIC", actorUserId: userId, portalAccessId: portalAccess?.id || null, notes: `${created.category.replaceAll("_", " ")} attachment added.`, idempotencyKey: `lab-attachment:${created.id}` } });
      await tx.patientTimelineEvent.create({ data: { clinicId, patientId: labCase.patientId, encounterId: labCase.encounterId, actorId: userId, eventType: "LAB_ATTACHMENT_ADDED", objectType: "LAB_CASE_ATTACHMENT", objectId: created.id, title: "Laboratory case attachment added", summary: created.category.replaceAll("_", " "), source: portalAccess ? "LAB_PORTAL" : "APPLICATION", idempotencyKey: `lab-attachment:${created.id}` } });
      await tx.auditLog.create({ data: { clinicId, userId, patientId: labCase.patientId, actorRole, action: "LAB_ATTACHMENT_ADDED", entityType: "LAB_CASE_ATTACHMENT", entityId: created.id, source: portalAccess ? "LAB_PORTAL" : "APPLICATION", afterState: { labCaseId: caseId, category: created.category, contentType: created.contentType, sizeBytes: created.sizeBytes, sha256 } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, attachmentId: attachment.id }, { status: 201 });
  } catch (error) {
    if (blob) await del(blob.url, { token }).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This attachment was uploaded concurrently and already exists." }, { status: 409 });
    return NextResponse.json({ error: "The attachment could not be committed. No partial file was retained." }, { status: 500 });
  }
}

