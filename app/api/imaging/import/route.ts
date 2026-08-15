import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";
import { dicomDate, dicomPersonName, parseDicomPart10 } from "@/lib/dicom";
import { IMAGING_MODALITIES, MAX_IMAGING_UPLOAD_BYTES, imagingExtension, parseToothCodes, sniffImagingType } from "@/lib/imaging";
import { scanImagingObject } from "@/lib/imaging-scan";
import { createSafeImagingThumbnail } from "@/lib/imaging-derivatives";

export const runtime = "nodejs";

function optionalInteger(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

export async function POST(request: Request) {
  const { user, response } = await requireApiFeature("imaging", "uploadImaging");
  if (!user) return response!;
  const token = process.env.IMAGING_READ_WRITE_TOKEN || process.env.IMAGING_BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Private imaging storage is not configured." }, { status: 503 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGING_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Choose one DICOM, JPEG, PNG, or TIFF file up to 50 MB." }, { status: 400 });
  }

  const patientId = optionalInteger(formData.get("patientId"));
  const encounterId = optionalInteger(formData.get("encounterId"));
  const treatmentPlanId = optionalInteger(formData.get("treatmentPlanId"));
  const orderingProviderId = optionalInteger(formData.get("orderingProviderId"));
  if ([patientId, encounterId, treatmentPlanId, orderingProviderId].some(Number.isNaN)) {
    return NextResponse.json({ error: "One of the selected clinical records is invalid." }, { status: 400 });
  }
  if (!patientId && (encounterId || treatmentPlanId)) {
    return NextResponse.json({ error: "Choose a patient before linking a visit or treatment plan." }, { status: 400 });
  }

  const modality = String(formData.get("modality") || "");
  if (!IMAGING_MODALITIES.includes(modality as (typeof IMAGING_MODALITIES)[number])) {
    return NextResponse.json({ error: "Select a supported imaging type." }, { status: 400 });
  }
  const treatmentStage = String(formData.get("treatmentStage") || "OTHER");
  if (!["PRE_TREATMENT", "POST_TREATMENT", "OTHER"].includes(treatmentStage)) {
    return NextResponse.json({ error: "Choose whether this X-ray is pre-treatment, post-treatment, or other." }, { status: 400 });
  }
  const acquisitionDate = new Date(String(formData.get("acquisitionDate") || ""));
  if (Number.isNaN(acquisitionDate.getTime())) return NextResponse.json({ error: "Enter a valid acquisition date and time." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImagingType(bytes);
  if (!contentType) return NextResponse.json({ error: "The file signature is not a supported DICOM, JPEG, PNG, or TIFF object." }, { status: 400 });

  let dicom: ReturnType<typeof parseDicomPart10> = {};
  if (contentType === "application/dicom") {
    try {
      dicom = parseDicomPart10(bytes);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "The DICOM metadata could not be validated." }, { status: 400 });
    }
  }

  const patient = patientId
    ? await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, dateOfBirth: true } })
    : null;
  if (patientId && !patient) return NextResponse.json({ error: "The selected patient is not available in this clinic." }, { status: 404 });
  const matchReason = String(formData.get("matchReason") || "").trim().slice(0, 500);
  if (patient && (formData.get("identityConfirmed") !== "1" || matchReason.length < 8)) {
    return NextResponse.json({ error: "Confirm a non-name identity signal and record how the patient match was verified." }, { status: 400 });
  }
  const sourceBirthDate = dicomDate(dicom.patientBirthDate);
  if (patient?.dateOfBirth && sourceBirthDate && patient.dateOfBirth.toISOString().slice(0, 10) !== sourceBirthDate) {
    return NextResponse.json({ error: "The DICOM date of birth conflicts with the selected patient. Import it as unmatched and resolve the conflict in the identity queue." }, { status: 409 });
  }

  const [encounter, treatmentPlan, provider] = await Promise.all([
    encounterId ? prisma.encounter.findFirst({ where: { id: encounterId, clinicId: user.clinicId, ...(patientId ? { patientId } : {}) }, select: { id: true } }) : null,
    treatmentPlanId ? prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, cancelledAt: null, ...(patientId ? { patientId } : {}) }, select: { id: true } }) : null,
    orderingProviderId ? prisma.clinicProvider.findFirst({ where: { id: orderingProviderId, clinicId: user.clinicId, active: true }, select: { id: true } }) : null,
  ]);
  if ((encounterId && !encounter) || (treatmentPlanId && !treatmentPlan) || (orderingProviderId && !provider)) {
    return NextResponse.json({ error: "The selected visit, plan, or practitioner does not belong to this clinic and patient." }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let scan: Awaited<ReturnType<typeof scanImagingObject>>;
  try {
    scan = await scanImagingObject(bytes, contentType, sha256);
  } catch {
    await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient?.id ?? null, actorRole: user.role, action: "IMAGING_IMPORT_FAILED", entityType: "IMAGING_STUDY", outcome: "FAILURE", detail: "Configured malware validation was unavailable; import failed closed." } }).catch(() => undefined);
    return NextResponse.json({ error: "Imaging safety validation is temporarily unavailable. No file was stored; retry later." }, { status: 503 });
  }
  if (scan.status === "MALWARE_DETECTED") {
    await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient?.id ?? null, actorRole: user.role, action: "IMAGING_IMPORT_REJECTED", entityType: "IMAGING_STUDY", outcome: "FAILURE", detail: "The controlled import was rejected by malware validation." } }).catch(() => undefined);
    return NextResponse.json({ error: "The file failed imaging safety validation and was not stored." }, { status: 422 });
  }
  let thumbnail: { data: Buffer; width: number; height: number; sha256: string } | null = null;
  if (contentType !== "application/dicom") {
    try {
      thumbnail = await createSafeImagingThumbnail(bytes);
    } catch {
      return NextResponse.json({ error: "The image decoder rejected this object. No file was stored." }, { status: 400 });
    }
  }
  const idempotencyKey = `manual:${sha256}`;
  const duplicate = await prisma.imagingStudy.findFirst({
    where: { clinicId: user.clinicId, OR: [{ contentHash: sha256 }, ...(dicom.studyInstanceUid ? [{ studyInstanceUid: dicom.studyInstanceUid }] : [])] },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "This imaging object is already in the repository.", duplicateStudyId: duplicate.id }, { status: 409 });

  const sourceName = contentType === "application/dicom" ? "Manual DICOM import" : "Manual media import";
  const sourceType = contentType === "application/dicom" ? "MANUAL_DICOM" : "MANUAL_MEDIA";
  const storageKey = `imaging/${user.clinicId}/${crypto.randomUUID()}/original.${imagingExtension(contentType)}`;
  let blob: Awaited<ReturnType<typeof put>> | null = null;
  let thumbnailBlob: Awaited<ReturnType<typeof put>> | null = null;
  try {
    blob = await put(storageKey, file, { access: "private", contentType, addRandomSuffix: false, token });
    if (thumbnail) thumbnailBlob = await put(storageKey.replace(/original\.[^.]+$/, "thumbnail.jpg"), thumbnail.data, { access: "private", contentType: "image/jpeg", addRandomSuffix: false, token });
  } catch {
    if (blob) await del(blob.url, { token }).catch(() => undefined);
    await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient?.id ?? null, actorRole: user.role, action: "IMAGING_IMPORT_FAILED", entityType: "IMAGING_STUDY", outcome: "FAILURE", detail: "Private object storage rejected the controlled upload before metadata was committed." } }).catch(() => undefined);
    return NextResponse.json({ error: "Private imaging storage is temporarily unavailable. No study was imported." }, { status: 503 });
  }
  if (!blob) return NextResponse.json({ error: "Private imaging storage is temporarily unavailable." }, { status: 503 });

  try {
    const study = await prisma.$transaction(async (tx) => {
      const source = await tx.imagingSource.upsert({
        where: { clinicId_name: { clinicId: user.clinicId, name: sourceName } },
        update: { status: "ACTIVE", lastHealthAt: new Date(), lastSyncAt: new Date(), lastError: null },
        create: { clinicId: user.clinicId, name: sourceName, adapterType: sourceType, status: "ACTIVE", lastHealthAt: new Date(), lastSyncAt: new Date(), capabilities: { import: true, retrieve: true, query: false } },
      });
      const created = await tx.imagingStudy.create({
        data: {
          clinicId: user.clinicId,
          patientId: patient?.id ?? null,
          encounterId: encounter?.id ?? null,
          treatmentPlanId: treatmentPlan?.id ?? null,
          orderingProviderId: provider?.id ?? null,
          acquiringOperatorId: user.id,
          createdById: user.id,
          sourceId: source.id,
          sourceType,
          status: patient ? "AVAILABLE" : "UNMATCHED",
          matchStatus: patient ? "CONFIRMED" : "UNMATCHED",
          matchConfidence: patient ? 100 : null,
          matchReason: patient ? matchReason : "No clinic patient was confirmed during import.",
          modality,
          treatmentStage,
          description: String(formData.get("description") || dicom.studyDescription || "").trim().slice(0, 500) || null,
          clinicalIndication: String(formData.get("clinicalIndication") || "").trim().slice(0, 1000) || null,
          radiationMetadata: contentType === "application/dicom" ? {
            kvp: dicom.kvp || null,
            exposureTimeMs: dicom.exposureTimeMs || null,
            tubeCurrentMa: dicom.tubeCurrentMa || null,
            exposureMas: dicom.exposureMas || null,
            doseAreaProduct: dicom.doseAreaProduct || null,
          } : undefined,
          anatomicalRegion: String(formData.get("anatomicalRegion") || "").trim().slice(0, 160) || null,
          laterality: String(formData.get("laterality") || "").trim().slice(0, 40) || null,
          toothCodes: parseToothCodes(formData.get("toothCodes")),
          acquisitionDate,
          accessionNumber: String(formData.get("accessionNumber") || dicom.accessionNumber || "").trim().slice(0, 128) || null,
          studyInstanceUid: dicom.studyInstanceUid?.slice(0, 128) || null,
          dicomPatientId: dicom.patientId?.slice(0, 128) || null,
          externalPatientId: String(formData.get("externalPatientId") || "").trim().slice(0, 128) || null,
          vendorRecordId: String(formData.get("vendorRecordId") || "").trim().slice(0, 128) || null,
          sourcePatientName: dicomPersonName(dicom.patientName)?.slice(0, 255) || null,
          sourcePatientBirthDate: dicomDate(dicom.patientBirthDate) ? new Date(`${dicomDate(dicom.patientBirthDate)}T12:00:00.000Z`) : null,
          contentHash: sha256,
          idempotencyKey,
        },
      });
      const series = await tx.imagingSeries.create({ data: { clinicId: user.clinicId, studyId: created.id, seriesInstanceUid: dicom.seriesInstanceUid?.slice(0, 128) || null, seriesNumber: dicom.seriesNumber || 1, modality, description: dicom.seriesDescription?.slice(0, 500) || null, bodySite: String(formData.get("anatomicalRegion") || "").trim().slice(0, 160) || null, laterality: String(formData.get("laterality") || "").trim().slice(0, 40) || null, startedAt: acquisitionDate } });
      const instance = await tx.imagingInstance.create({ data: { clinicId: user.clinicId, studyId: created.id, seriesId: series.id, sopInstanceUid: dicom.sopInstanceUid?.slice(0, 128) || null, sopClassUid: dicom.sopClassUid?.slice(0, 128) || null, instanceNumber: dicom.instanceNumber || 1, frameCount: dicom.frameCount || 1, transferSyntaxUid: dicom.transferSyntaxUid?.slice(0, 128) || null, contentHash: sha256 } });
      const originalAsset = await tx.imagingAsset.create({ data: { clinicId: user.clinicId, studyId: created.id, instanceId: instance.id, role: "ORIGINAL", storageKey: blob.pathname, blobUrl: blob.url, contentType, sizeBytes: file.size, originalName: file.name.slice(0, 255), sha256, scanStatus: scan.engine ? `${scan.status}:${scan.engine}` : scan.status } });
      if (thumbnail && thumbnailBlob) await tx.imagingAsset.create({ data: { clinicId: user.clinicId, studyId: created.id, instanceId: instance.id, role: "THUMBNAIL", storageKey: thumbnailBlob.pathname, blobUrl: thumbnailBlob.url, contentType: "image/jpeg", sizeBytes: thumbnail.data.length, originalName: null, sha256: thumbnail.sha256, width: thumbnail.width, height: thumbnail.height, scanStatus: "DERIVED_FROM_VALIDATED_ORIGINAL", derivedFromAssetId: originalAsset.id } });
      await tx.imagingIngestEvent.create({ data: { clinicId: user.clinicId, sourceId: source.id, studyId: created.id, createdById: user.id, idempotencyKey, payloadHash: sha256, status: "PROCESSED", attempts: 1, processedAt: new Date() } });
      await tx.imagingProcessingJob.create({ data: { clinicId: user.clinicId, studyId: created.id, jobType: contentType === "application/dicom" ? "RENDER_DICOM_PREVIEW" : "VERIFY_RENDERABLE_ASSET", idempotencyKey: `${idempotencyKey}:preview`, status: contentType === "application/dicom" ? "BLOCKED" : "COMPLETED", attempts: 1, completedAt: contentType === "application/dicom" ? null : new Date(), failureReason: contentType === "application/dicom" ? "A certified DICOM renderer has not been configured; the original remains preserved and retrievable." : null } });
      if (patient) {
        await tx.imagingMatchResolution.create({ data: { clinicId: user.clinicId, studyId: created.id, patientId: patient.id, resolvedById: user.id, decision: "MANUAL_CONFIRMED", signals: { clinicPatientId: patient.id, dicomPatientId: dicom.patientId || null, externalPatientId: String(formData.get("externalPatientId") || "").trim() || null, accessionNumber: String(formData.get("accessionNumber") || dicom.accessionNumber || "").trim() || null, dateOfBirthMatched: Boolean(sourceBirthDate && patient.dateOfBirth && sourceBirthDate === patient.dateOfBirth.toISOString().slice(0, 10)) }, reason: matchReason } });
        await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: patient.id, encounterId: encounter?.id ?? null, actorId: user.id, eventType: "IMAGING_IMPORTED", objectType: "IMAGING_STUDY", objectId: created.id, title: "Imaging study imported", summary: `${modality.replaceAll("_", " ")} · original preserved`, idempotencyKey: `imaging-import:${created.id}`, occurredAt: acquisitionDate } });
      }
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient?.id ?? null, actorRole: user.role, action: "IMAGING_STUDY_IMPORTED", entityType: "IMAGING_STUDY", entityId: created.id, detail: `${sourceType} ${modality}; match ${patient ? "confirmed" : "unmatched"}`, afterState: { status: created.status, matchStatus: created.matchStatus, contentHash: sha256 } } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, studyId: study.id, matched: Boolean(patient) }, { status: 201 });
  } catch (error) {
    await Promise.all([del(blob.url, { token }).catch(() => undefined), thumbnailBlob ? del(thumbnailBlob.url, { token }).catch(() => undefined) : Promise.resolve()]);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This imaging object was imported concurrently and already exists." }, { status: 409 });
    await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient?.id ?? null, actorRole: user.role, action: "IMAGING_IMPORT_FAILED", entityType: "IMAGING_STUDY", outcome: "FAILURE", detail: "The controlled import transaction failed; the uploaded object was removed." } }).catch(() => undefined);
    return NextResponse.json({ error: "The imaging import could not be committed. No partial study was retained; retry safely." }, { status: 500 });
  }
}
