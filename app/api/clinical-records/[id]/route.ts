import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicalRecordSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiClinicalSigner } from "@/lib/tenant";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { ensureEncounter } from "@/lib/encounters";
import { Prisma } from "@prisma/client";

async function getId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function optionalText(value?: string) {
  if (value === undefined) return undefined;
  const text = value.trim();
  return text ? text : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiClinicalSigner("correctClinical");
    if (!user) return response;
    const id = await getId(params);
    if (!id) return NextResponse.json({ error: "Invalid record id." }, { status: 400 });

    const existingRecord = await prisma.clinicalRecord.findFirst({ where: { id, clinicId: user.clinicId, enteredInErrorAt: null } });
    if (!existingRecord) return NextResponse.json({ error: "Record not found." }, { status: 404 });

    const raw = await request.json();
    if (raw.confirmed !== true) return NextResponse.json({ error: "Confirm the clinical record update." }, { status: 400 });
    const data = clinicalRecordSchema.partial().parse(raw);
    const patientId = data.patientId ?? existingRecord.patientId;
    if (patientId !== existingRecord.patientId) return NextResponse.json({ error: "A signed clinical record cannot be moved to another patient." }, { status: 400 });
    if (data.patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId }, select: { id: true } });
      if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    const visitDate = data.visitDate;

    // Signing off a note never waits on the visit being marked off.
    const appointment = visitDate ? await findVisitForDate(user.clinicId, patientId, visitDate) : null;

    const record = await prisma.$transaction(async (tx) => {
      const encounter = visitDate
        ? await ensureEncounter(tx, { clinicId: user.clinicId, patientId, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(visitDate), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" })
        : null;
      const nextData = {
        visitDate: visitDate ? localDate(visitDate) : existingRecord.visitDate,
        chiefComplaint: data.chiefComplaint ?? existingRecord.chiefComplaint,
        diagnosis: data.diagnosis === undefined ? existingRecord.diagnosis : optionalText(data.diagnosis),
        clinicalNotes: data.clinicalNotes === undefined ? existingRecord.clinicalNotes : optionalText(data.clinicalNotes),
        medicalHistory: data.medicalHistory === undefined ? existingRecord.medicalHistory : data.medicalHistory.length ? JSON.stringify(data.medicalHistory) : null,
        drugAllergies: data.drugAllergies === undefined ? existingRecord.drugAllergies : optionalText(data.drugAllergies),
        medications: data.medications === undefined ? existingRecord.medications : optionalText(data.medications),
        otherHistory: data.otherHistory === undefined ? existingRecord.otherHistory : optionalText(data.otherHistory),
        bloodPressure: data.bloodPressure === undefined ? existingRecord.bloodPressure : optionalText(data.bloodPressure),
        weightKg: data.weightKg === undefined ? existingRecord.weightKg : optionalText(data.weightKg),
        dentalHistory: data.dentalHistory === undefined ? existingRecord.dentalHistory : optionalText(data.dentalHistory),
        treatmentDone: data.treatmentDone === undefined ? existingRecord.treatmentDone : optionalText(data.treatmentDone),
        estimateAmount: data.estimateAmount === undefined ? existingRecord.estimateAmount : data.estimateAmount === "" ? null : data.estimateAmount,
        consentGiven: data.consentGiven ?? existingRecord.consentGiven,
        consentNotes: data.consentNotes === undefined ? existingRecord.consentNotes : optionalText(data.consentNotes),
      };
      let updated;
      if (existingRecord.status === "DRAFT") {
        const claimed = await tx.clinicalRecord.updateMany({ where: { id, clinicId: user.clinicId, status: "DRAFT", enteredInErrorAt: null }, data: { ...nextData, encounterId: encounter?.id ?? existingRecord.encounterId, providerId: appointment?.providerId ?? existingRecord.providerId, authorId: user.id, status: "FINAL", signedAt: new Date() } });
        if (claimed.count !== 1) throw new Error("CLINICAL_VERSION_CONFLICT");
        updated = await tx.clinicalRecord.findUniqueOrThrow({ where: { id } });
      } else {
        if (existingRecord.status !== "FINAL") throw new Error("CLINICAL_VERSION_CONFLICT");
        const claimed = await tx.clinicalRecord.updateMany({ where: { id, clinicId: user.clinicId, status: "FINAL", enteredInErrorAt: null }, data: { status: "SUPERSEDED" } });
        if (claimed.count !== 1) throw new Error("CLINICAL_VERSION_CONFLICT");
        updated = await tx.clinicalRecord.create({ data: { ...nextData, clinicId: user.clinicId, patientId, encounterId: encounter?.id ?? existingRecord.encounterId, providerId: appointment?.providerId ?? existingRecord.providerId, authorId: user.id, status: "FINAL", source: existingRecord.source, version: existingRecord.version + 1, signedAt: new Date(), supersedesId: existingRecord.id } });
      }
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId, actorRole: user.role, action: "CLINICAL_RECORD_CORRECTED", entityType: "CLINICAL_RECORD", entityId: String(updated.id), detail: `Created version ${updated.version} from record #${id}`, reason: existingRecord.status === "DRAFT" ? "Draft finalized after user confirmation" : "Corrected after user confirmation", beforeState: { id, version: existingRecord.version, status: existingRecord.status }, afterState: { id: updated.id, version: updated.version, status: updated.status } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed." }, { status: 400 });
    if (error instanceof Error && (error.message === "CLINICAL_VERSION_CONFLICT" || (error as { code?: string }).code === "P2034")) return NextResponse.json({ error: "This record changed in another session. Reload before correcting it." }, { status: 409 });
    return NextResponse.json({ error: "Record not found or could not be updated." }, { status: 404 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiClinicalSigner("correctClinical");
  if (!user) return response;
  const id = await getId(params);
  if (!id) return NextResponse.json({ error: "Invalid record id." }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({})) as { confirmed?: unknown };
    if (body.confirmed !== true) return NextResponse.json({ error: "Confirm this action." }, { status: 400 });
    const reason = "Marked entered in error after user confirmation";
    const record = await prisma.clinicalRecord.findFirst({ where: { id, clinicId: user.clinicId, enteredInErrorAt: null }, select: { id: true, patientId: true } });
    if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    await prisma.$transaction([
      prisma.clinicalRecord.update({ where: { id: record.id }, data: { status: "ENTERED_IN_ERROR", enteredInErrorAt: new Date(), enteredInErrorReason: reason } }),
      prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: record.patientId, actorRole: user.role, action: "CLINICAL_RECORD_ENTERED_IN_ERROR", entityType: "CLINICAL_RECORD", entityId: String(record.id), detail: `Clinical record retained and marked entered in error`, reason } }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
}
