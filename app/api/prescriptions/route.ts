import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validations";
import { requireApiClinicalSigner } from "@/lib/tenant";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { ensureEncounter } from "@/lib/encounters";
import { allergySummaryFrom, medicationSummary, patientAge, prescriptionWarnings } from "@/lib/prescription-core";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiClinicalSigner("issuePrescription");
    if (!user) return response;
    const data = prescriptionSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, dateOfBirth: true, gender: true, medicalNotes: true, intakeRequests: { where: { drugAllergies: { not: null } }, select: { drugAllergies: true, status: true }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 20 } } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    // Prescribing never waits on the visit being marked off.
    const appointment = await findVisitForDate(user.clinicId, patient.id, data.prescribedOn);
    const allergies = allergySummaryFrom(patient.intakeRequests, patient.medicalNotes);
    const age = patientAge(patient.dateOfBirth, localDate(data.prescribedOn));
    const warnings = prescriptionWarnings({ items: data.medicationItems, allergies, age });
    if (warnings.length && !data.allergyAcknowledged) return NextResponse.json({ error: "Review and acknowledge the prescription safety warnings before issuing.", warnings }, { status: 409 });

    const prescription = await prisma.$transaction(async (tx) => {
      const encounter = await ensureEncounter(tx, { clinicId: user.clinicId, patientId: patient.id, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(data.prescribedOn), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" });
      const created = await tx.prescription.create({
        data: {
          clinicId: user.clinicId,
          patientId: patient.id,
          encounterId: encounter.id,
          providerId: appointment?.providerId ?? null,
          authorId: user.id,
          prescribedOn: localDate(data.prescribedOn),
          diagnosis: data.diagnosis || null,
          instructions: data.instructions || null,
          nextVisit: data.nextVisit || null,
          medicines: medicationSummary(data.medicationItems),
          allergySnapshot: allergies,
          patientAgeSnapshot: age === null ? null : String(age),
          patientSexSnapshot: patient.gender,
          providerNameSnapshot: user.fullName,
          providerQualificationSnapshot: user.qualification || null,
          providerRegistrationSnapshot: user.registrationNumber!.trim(),
          issuePlace: data.issuePlace || user.clinic.address || null,
          safetyWarnings: warnings,
          signatureStatement: user.signatureLabel || `Digitally issued by ${user.fullName}`,
          signedAt: new Date(),
          status: "ISSUED",
          issuedAt: new Date(),
          medicationItems: { create: data.medicationItems.map((item, index) => ({ ...item, startDate: item.startDate ? localDate(item.startDate) : null, endDate: item.endDate ? localDate(item.endDate) : null, sortOrder: index })) },
        },
      });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "PRESCRIPTION_ISSUED", entityType: "PRESCRIPTION", entityId: String(created.id), detail: `Prescription issued for encounter #${encounter.id}` } });
      return created;
    });
    return NextResponse.json(prescription, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Please check the prescription details.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save prescription." }, { status: 500 });
  }
}
