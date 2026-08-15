"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { hasFeature } from "@/lib/features";
import { comparisonCompatibility, parseToothCodes } from "@/lib/imaging";
import { requirePermission, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type ImagingActionState = { ok: boolean; message: string };

async function authorized(permission: Permission) {
  const user = await requirePermission(permission);
  return (await hasFeature(user.clinicId, "imaging")) ? user : null;
}

function requiredText(formData: FormData, name: string, max: number) {
  return String(formData.get(name) || "").trim().slice(0, max);
}

function optionalId(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function refreshImaging(patientId?: number | null) {
  revalidatePath("/dashboard/imaging");
  if (patientId) {
    revalidatePath(`/dashboard/patients/${patientId}`);
    revalidatePath(`/dashboard/patients/${patientId}/xrays`);
    revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
  }
}

export async function saveImagingReportAction(
  _previous: ImagingActionState,
  formData: FormData,
): Promise<ImagingActionState> {
  const user = await authorized("signImaging");
  if (!user) return { ok: false, message: "Imaging is not enabled for this clinic." };
  const studyId = requiredText(formData, "studyId", 64);
  const findings = requiredText(formData, "findings", 6000);
  const impression = requiredText(formData, "impression", 3000);
  const confirmed = formData.get("confirmed") === "1";
  const correctionReason = "Corrected after user confirmation";
  if (!studyId || (!findings && !impression)) return { ok: false, message: "Record findings or an impression before signing." };

  const study = await prisma.imagingStudy.findFirst({
    where: { id: studyId, clinicId: user.clinicId, enteredInErrorAt: null, archivedAt: null },
    include: { reports: { where: { status: "FINAL" }, orderBy: { version: "desc" }, take: 1 } },
  });
  if (!study) return { ok: false, message: "The study is not available in this clinic." };
  const prior = study.reports[0];
  if (prior && !confirmed) return { ok: false, message: "Confirm the signed report correction." };

  const correlationId = randomUUID();
  const provider = await prisma.clinicProvider.findFirst({ where: { clinicId: user.clinicId, active: true, name: { equals: user.fullName, mode: "insensitive" } }, select: { id: true } });
  try { await prisma.$transaction(async (tx) => {
    if (prior) await tx.imagingReport.update({ where: { id: prior.id }, data: { status: "SUPERSEDED" } });
    const report = await tx.imagingReport.create({
      data: {
        clinicId: user.clinicId,
        studyId: study.id,
        authorId: user.id,
        status: "FINAL",
        findings: findings || null,
        impression: impression || null,
        version: (prior?.version || 0) + 1,
        signedAt: new Date(),
        correctionReason: prior ? correctionReason : null,
        supersedesId: prior?.id || null,
      },
    });
    await tx.imagingStudy.update({ where: { id: study.id }, data: { status: "REVIEWED", reviewedAt: new Date(), signedAt: new Date(), reviewingProviderId: provider?.id || null, version: { increment: 1 } } });
    if (study.patientId) await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: study.patientId, encounterId: study.encounterId, actorId: user.id, eventType: prior ? "IMAGING_REPORT_CORRECTED" : "IMAGING_REPORT_SIGNED", objectType: "IMAGING_REPORT", objectId: report.id, title: prior ? "Imaging report corrected and signed" : "Imaging report reviewed and signed", summary: impression || findings.slice(0, 300), idempotencyKey: `imaging-report:${report.id}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: study.patientId, actorRole: user.role, action: prior ? "IMAGING_REPORT_CORRECTED" : "IMAGING_REPORT_SIGNED", entityType: "IMAGING_REPORT", entityId: report.id, reason: prior ? correctionReason : null, correlationId, beforeState: prior ? { reportId: prior.id, version: prior.version, status: prior.status } : Prisma.JsonNull, afterState: { studyId: study.id, version: report.version, status: report.status } } });
  }); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: "The study was signed concurrently. Refresh before making another correction." };
    return { ok: false, message: "The report could not be signed. No partial report was saved; retry after refreshing." };
  }
  refreshImaging(study.patientId);
  return { ok: true, message: prior ? "The corrected report was signed and the prior version was preserved." : "The imaging report was signed." };
}

export async function resolveImagingMatchAction(
  _previous: ImagingActionState,
  formData: FormData,
): Promise<ImagingActionState> {
  const user = await authorized("uploadImaging");
  if (!user) return { ok: false, message: "Imaging is not enabled for this clinic." };
  const studyId = requiredText(formData, "studyId", 64);
  const patientId = optionalId(formData, "patientId");
  const reason = "Identity match verified after user confirmation";
  const acknowledged = formData.get("acknowledgeConflicts") === "1";
  if (!studyId || !patientId || formData.get("confirmed") !== "1" || !acknowledged) return { ok: false, message: "Select the patient, acknowledge the identity check, and confirm the match." };

  const [study, patient] = await Promise.all([
    prisma.imagingStudy.findFirst({ where: { id: studyId, clinicId: user.clinicId, patientId: null, matchStatus: "UNMATCHED", enteredInErrorAt: null } }),
    prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, fullName: true, dateOfBirth: true } }),
  ]);
  if (!study || !patient) return { ok: false, message: "The unmatched study or patient is no longer available." };
  const linkedRecords = await Promise.all([
    study.encounterId ? prisma.encounter.findFirst({ where: { id: study.encounterId, clinicId: user.clinicId, patientId }, select: { id: true } }) : null,
    study.treatmentPlanId ? prisma.treatmentPlan.findFirst({ where: { id: study.treatmentPlanId, clinicId: user.clinicId, patientId }, select: { id: true } }) : null,
  ]);
  if ((study.encounterId && !linkedRecords[0]) || (study.treatmentPlanId && !linkedRecords[1])) return { ok: false, message: "The study is linked to clinical context for another patient and cannot be matched here." };

  const normalizedSourceName = study.sourcePatientName?.toLocaleLowerCase().replace(/[^a-z0-9]/g, "") || null;
  const normalizedPatientName = patient.fullName.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const conflicts = [
    ...(normalizedSourceName && normalizedSourceName !== normalizedPatientName ? [{ field: "name", source: study.sourcePatientName, selected: patient.fullName }] : []),
    ...(study.sourcePatientBirthDate && (!patient.dateOfBirth || study.sourcePatientBirthDate.toISOString().slice(0, 10) !== patient.dateOfBirth.toISOString().slice(0, 10)) ? [{ field: "dateOfBirth", source: study.sourcePatientBirthDate.toISOString().slice(0, 10), selected: patient.dateOfBirth?.toISOString().slice(0, 10) || null }] : []),
  ];
  const correlationId = randomUUID();
  try { await prisma.$transaction(async (tx) => {
    const claimed = await tx.imagingStudy.updateMany({ where: { id: study.id, clinicId: user.clinicId, patientId: null, matchStatus: "UNMATCHED" }, data: { patientId, matchStatus: "CONFIRMED", matchConfidence: conflicts.length ? 50 : 90, matchReason: reason, status: "AVAILABLE", version: { increment: 1 } } });
    if (claimed.count !== 1) throw new Error("This study was resolved by another user. Refresh the worklist.");
    const resolution = await tx.imagingMatchResolution.create({ data: { clinicId: user.clinicId, studyId: study.id, patientId, resolvedById: user.id, decision: conflicts.length ? "MANUAL_OVERRIDE" : "MANUAL_CONFIRMED", signals: { clinicPatientId: patientId, dicomPatientId: study.dicomPatientId, accessionNumber: study.accessionNumber, studyDate: study.acquisitionDate.toISOString() }, conflictingFields: conflicts.length ? conflicts : Prisma.JsonNull, reason } });
    await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId, encounterId: study.encounterId, actorId: user.id, eventType: "IMAGING_MATCH_RESOLVED", objectType: "IMAGING_STUDY", objectId: study.id, title: "Imported imaging matched to patient", summary: `${study.modality.replaceAll("_", " ")} · manually verified`, idempotencyKey: `imaging-match:${resolution.id}`, occurredAt: study.acquisitionDate } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId, actorRole: user.role, action: "IMAGING_MATCH_RESOLVED", entityType: "IMAGING_STUDY", entityId: study.id, reason, correlationId, beforeState: { patientId: null, matchStatus: "UNMATCHED" }, afterState: { patientId, matchStatus: "CONFIRMED", conflicts } } });
  }); } catch (error) {
    return { ok: false, message: error instanceof Error && error.message.startsWith("This study was resolved") ? error.message : "The patient match could not be committed. No partial match was saved." };
  }
  refreshImaging(patientId);
  return { ok: true, message: "The verified study is now available in Patient 360." };
}

export async function archiveImagingStudyAction(
  _previous: ImagingActionState,
  formData: FormData,
): Promise<ImagingActionState> {
  const user = await authorized("signImaging");
  if (!user) return { ok: false, message: "Imaging is not enabled for this clinic." };
  const studyId = requiredText(formData, "studyId", 64);
  if (!studyId || formData.get("confirmed") !== "1") return { ok: false, message: "Confirm X-ray removal." };
  const reason = "Removed from active views after user confirmation.";
  const study = await prisma.imagingStudy.findFirst({ where: { id: studyId, clinicId: user.clinicId, enteredInErrorAt: null }, select: { id: true, patientId: true, encounterId: true, status: true } });
  if (!study) return { ok: false, message: "The study is not available in this clinic." };
  const correlationId = randomUUID();
  try { await prisma.$transaction(async (tx) => {
    await tx.imagingStudy.update({ where: { id: study.id }, data: { status: "ENTERED_IN_ERROR", archivedAt: new Date(), archiveReason: reason, enteredInErrorAt: new Date(), enteredInErrorReason: reason, version: { increment: 1 } } });
    if (study.patientId) await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: study.patientId, encounterId: study.encounterId, actorId: user.id, eventType: "IMAGING_ENTERED_IN_ERROR", objectType: "IMAGING_STUDY", objectId: study.id, title: "Imaging study marked entered in error", summary: reason, idempotencyKey: `imaging-error:${study.id}:${correlationId}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: study.patientId, actorRole: user.role, action: "IMAGING_ENTERED_IN_ERROR", entityType: "IMAGING_STUDY", entityId: study.id, reason, correlationId, beforeState: { status: study.status }, afterState: { status: "ENTERED_IN_ERROR", originalRetained: true } } });
  }); } catch {
    return { ok: false, message: "The entered-in-error status could not be recorded. The study remains active; retry after refreshing." };
  }
  refreshImaging(study.patientId);
  return { ok: true, message: "The study was removed from active views; its original and audit history were retained." };
}

export async function createImagingComparisonAction(
  _previous: ImagingActionState,
  formData: FormData,
): Promise<ImagingActionState> {
  const user = await authorized("signImaging");
  if (!user) return { ok: false, message: "Imaging is not enabled for this clinic." };
  const baselineStudyId = requiredText(formData, "baselineStudyId", 64);
  const followupStudyId = requiredText(formData, "followupStudyId", 64);
  const note = requiredText(formData, "note", 4000);
  const comparisonPatientId = optionalId(formData, "comparisonPatientId");
  const treatmentPlanId = optionalId(formData, "treatmentPlanId");
  const completedFindingId = optionalId(formData, "completedFindingId");
  if (!comparisonPatientId || !baselineStudyId || !followupStudyId || baselineStudyId === followupStudyId || note.length < 8) return { ok: false, message: "Choose a verified patient, two different studies, and record a comparison note of at least 8 characters." };
  const studies = await prisma.imagingStudy.findMany({ where: { id: { in: [baselineStudyId, followupStudyId] }, clinicId: user.clinicId, patientId: { not: null }, enteredInErrorAt: null, archivedAt: null } });
  if (studies.length !== 2) return { ok: false, message: "Both studies must be active, matched records from this clinic." };
  const baseline = studies.find((item) => item.id === baselineStudyId)!;
  const followup = studies.find((item) => item.id === followupStudyId)!;
  if (baseline.patientId !== followup.patientId) return { ok: false, message: "Comparisons cannot cross patient identities." };
  if (baseline.patientId !== comparisonPatientId) return { ok: false, message: "The selected studies do not belong to the verified patient." };
  if (baseline.acquisitionDate > followup.acquisitionDate) return { ok: false, message: "The baseline must have an earlier acquisition time than the follow-up." };
  const [plan, finding] = await Promise.all([
    treatmentPlanId ? prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, patientId: baseline.patientId!, cancelledAt: null }, select: { id: true, encounterId: true } }) : null,
    completedFindingId ? prisma.dentalFinding.findFirst({ where: { id: completedFindingId, clinicId: user.clinicId, patientId: baseline.patientId!, status: "ACTIVE", recordType: "COMPLETED_PROCEDURE" }, select: { id: true, encounterId: true } }) : null,
  ]);
  if ((treatmentPlanId && !plan) || (completedFindingId && !finding)) return { ok: false, message: "The linked plan or completed procedure does not belong to this patient." };
  const compatibility = comparisonCompatibility(baseline, followup);
  const correlationId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.imagingComparison.create({ data: { clinicId: user.clinicId, patientId: baseline.patientId!, encounterId: finding?.encounterId || plan?.encounterId || followup.encounterId || null, baselineStudyId, followupStudyId, treatmentPlanId: plan?.id || null, completedFindingId: finding?.id || null, authorId: user.id, note, compatibilityNote: compatibility.note, status: "FINAL" } });
      await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: baseline.patientId!, encounterId: created.encounterId, actorId: user.id, eventType: "IMAGING_COMPARISON_SIGNED", objectType: "IMAGING_COMPARISON", objectId: created.id, title: "Pre-/post-treatment imaging comparison signed", summary: compatibility.note, idempotencyKey: `imaging-comparison:${created.id}` } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: baseline.patientId, actorRole: user.role, action: "IMAGING_COMPARISON_SIGNED", entityType: "IMAGING_COMPARISON", entityId: created.id, correlationId, afterState: { baselineStudyId, followupStudyId, compatibility: compatibility.compatible, treatmentPlanId: plan?.id || null, completedFindingId: finding?.id || null } } });
      return created;
    });
    refreshImaging(baseline.patientId);
    return { ok: true, message: `Comparison saved. ${compatibility.note}` };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: "This baseline and follow-up pair has already been compared." };
    return { ok: false, message: "The comparison could not be saved. No partial clinical record was created." };
  }
}

export async function saveImagingAnnotationAction(
  _previous: ImagingActionState,
  formData: FormData,
): Promise<ImagingActionState> {
  const user = await authorized("signImaging");
  if (!user) return { ok: false, message: "Imaging is not enabled for this clinic." };
  const studyId = requiredText(formData, "studyId", 64);
  const assetId = requiredText(formData, "assetId", 64);
  const label = requiredText(formData, "label", 500);
  const rawToothCode = requiredText(formData, "toothCode", 2);
  const toothCode = rawToothCode || null;
  const x = Number(formData.get("x"));
  const y = Number(formData.get("y"));
  if (!studyId || !assetId || label.length < 2 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return { ok: false, message: "Place a marker on the image and enter a label." };
  if (rawToothCode && parseToothCodes(rawToothCode)[0] !== rawToothCode) return { ok: false, message: "Use a valid two-digit FDI tooth code." };
  const asset = await prisma.imagingAsset.findFirst({ where: { id: assetId, studyId, clinicId: user.clinicId, study: { patientId: { not: null }, enteredInErrorAt: null } }, include: { study: { select: { patientId: true, encounterId: true } } } });
  if (!asset || !asset.study.patientId) return { ok: false, message: "The image is not available for annotation." };
  let annotation: { id: string };
  try { annotation = await prisma.$transaction(async (tx) => {
    const created = await tx.imagingAnnotation.create({ data: { clinicId: user.clinicId, studyId, assetId, authorId: user.id, toothCode, label, geometry: { type: "POINT", unit: "PERCENT", x, y } } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: asset.study.patientId, actorRole: user.role, action: "IMAGING_ANNOTATION_ADDED", entityType: "IMAGING_ANNOTATION", entityId: created.id, afterState: { studyId, assetId, toothCode, geometry: { type: "POINT", unit: "PERCENT", x, y } } } });
    return created;
  }); } catch {
    return { ok: false, message: "The annotation could not be saved. The original image was not changed." };
  }
  refreshImaging(asset.study.patientId);
  return { ok: true, message: `Annotation saved (${annotation.id.slice(-6)}). The original image was not altered.` };
}
