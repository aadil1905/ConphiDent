import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicalRecordSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";
import { findCompletedAppointment, localDate } from "@/lib/clinical-appointments";

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
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const id = await getId(params);
    if (!id) return NextResponse.json({ error: "Invalid record id." }, { status: 400 });

    const existingRecord = await prisma.clinicalRecord.findFirst({ where: { id, patient: { clinicId: user.clinicId } } });
    if (!existingRecord) return NextResponse.json({ error: "Record not found." }, { status: 404 });

    const data = clinicalRecordSchema.partial().parse(await request.json());
    const patientId = data.patientId ?? existingRecord.patientId;
    if (data.patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId }, select: { id: true } });
      if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    const visitDate = data.visitDate;

    if (visitDate) {
      const appointment = await findCompletedAppointment(user.clinicId, patientId, visitDate);
      if (!appointment) {
        return NextResponse.json(
          { error: "Select one of this patient's completed appointment dates." },
          { status: 400 },
        );
      }
    }

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.clinicalRecord.update({
        where: { id },
        data: {
        visitDate: visitDate ? localDate(visitDate) : undefined,
        patientId: data.patientId,
        chiefComplaint: data.chiefComplaint,
        diagnosis: optionalText(data.diagnosis),
        clinicalNotes: optionalText(data.clinicalNotes),
        medicalHistory: data.medicalHistory === undefined
          ? undefined
          : data.medicalHistory.length
            ? JSON.stringify(data.medicalHistory)
            : null,
        drugAllergies: optionalText(data.drugAllergies),
        medications: optionalText(data.medications),
        otherHistory: optionalText(data.otherHistory),
        bloodPressure: optionalText(data.bloodPressure),
        weightKg: optionalText(data.weightKg),
        dentalHistory: optionalText(data.dentalHistory),
        treatmentDone: optionalText(data.treatmentDone),
        estimateAmount: data.estimateAmount === undefined ? undefined : data.estimateAmount === "" ? null : data.estimateAmount,
        consentGiven: data.consentGiven,
        consentNotes: optionalText(data.consentNotes),
        },
      });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "CLINICAL_RECORD_UPDATED", entityType: "CLINICAL_RECORD", entityId: String(id), detail: `Clinical record updated for patient #${updated.patientId}` } });
      return updated;
    });
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed." }, { status: 400 });
    return NextResponse.json({ error: "Record not found or could not be updated." }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, response } = await requireApiPermission("manageClinical");
  if (!user) return response;
  const id = await getId(params);
  if (!id) return NextResponse.json({ error: "Invalid record id." }, { status: 400 });
  try {
    const record = await prisma.clinicalRecord.findFirst({ where: { id, patient: { clinicId: user.clinicId } }, select: { id: true, patientId: true } });
    if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    await prisma.$transaction([
      prisma.clinicalRecord.delete({ where: { id: record.id } }),
      prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "CLINICAL_RECORD_DELETED", entityType: "CLINICAL_RECORD", entityId: String(record.id), detail: `Clinical record deleted for patient #${record.patientId}` } }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }
}
