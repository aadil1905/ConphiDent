import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clinicalRecordSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiClinicalSigner } from "@/lib/tenant";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { ensureEncounter } from "@/lib/encounters";

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
    const { user, response } = await requireApiClinicalSigner();
    if (!user) return response;
    const data = clinicalRecordSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    // The note saves whether or not the visit has been marked off.
    const appointment = await findVisitForDate(user.clinicId, patient.id, data.visitDate);

    const record = await prisma.$transaction(async (tx) => {
      const encounter = await ensureEncounter(tx, { clinicId: user.clinicId, patientId: patient.id, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(data.visitDate), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" });
      const created = await tx.clinicalRecord.create({ data: { ...clinicalRecordData(data), clinicId: user.clinicId, patientId: patient.id, encounterId: encounter.id, providerId: appointment?.providerId ?? null, authorId: user.id, status: "FINAL", signedAt: new Date() } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "CLINICAL_RECORD_CREATED", entityType: "CLINICAL_RECORD", entityId: String(created.id), detail: `Signed clinical record for encounter #${encounter.id}` } });
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
