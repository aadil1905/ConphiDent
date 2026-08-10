import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicalRecordSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";
import { findCompletedAppointment, localDate } from "@/lib/clinical-appointments";

function optionalText(value?: string) {
  const text = value?.trim();
  return text ? text : null;
}

function clinicalRecordData(data: ReturnType<typeof clinicalRecordSchema.parse>) {
  return {
    patientId: data.patientId,
    visitDate: localDate(data.visitDate),
    chiefComplaint: data.chiefComplaint,
    diagnosis: optionalText(data.diagnosis),
    clinicalNotes: optionalText(data.clinicalNotes),
    medicalHistory: data.medicalHistory?.length ? JSON.stringify(data.medicalHistory) : null,
    drugAllergies: optionalText(data.drugAllergies),
    medications: optionalText(data.medications),
    otherHistory: optionalText(data.otherHistory),
    bloodPressure: optionalText(data.bloodPressure),
    weightKg: optionalText(data.weightKg),
    dentalHistory: optionalText(data.dentalHistory),
    treatmentDone: optionalText(data.treatmentDone),
    estimateAmount: data.estimateAmount === "" ? null : data.estimateAmount ?? null,
    consentGiven: Boolean(data.consentGiven),
    consentNotes: optionalText(data.consentNotes),
  };
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const data = clinicalRecordSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    const appointment = await findCompletedAppointment(user.clinicId, patient.id, data.visitDate);
    if (!appointment) {
      return NextResponse.json(
        { error: "Select one of this patient's completed appointment dates." },
        { status: 400 },
      );
    }

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.clinicalRecord.create({ data: { ...clinicalRecordData(data), patientId: patient.id } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "CLINICAL_RECORD_CREATED", entityType: "CLINICAL_RECORD", entityId: String(created.id), detail: `Clinical record created for patient #${patient.id}` } });
      return created;
    });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create clinical record." }, { status: 500 });
  }
}
