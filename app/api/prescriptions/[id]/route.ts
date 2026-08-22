import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { ensureEncounter } from "@/lib/encounters";
import { prisma } from "@/lib/prisma";
import { requireApiClinicalSigner, requireApiFeature } from "@/lib/tenant";
import { prescriptionSchema } from "@/lib/validations";
import { allergySummaryFrom, medicationSummary, patientAge, prescriptionWarnings } from "@/lib/prescription-core";
import { Prisma } from "@prisma/client";

async function prescriptionId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiClinicalSigner("issuePrescription");
    if (!user) return response;
    const id = await prescriptionId(params);
    if (!id) return NextResponse.json({ error: "Invalid prescription." }, { status: 400 });
    const raw = await request.json();
    if (raw.confirmed !== true) return NextResponse.json({ error: "Confirm the prescription correction." }, { status: 400 });
    const data = prescriptionSchema.parse(raw);
    const existing = await prisma.prescription.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null } });
    if (!existing) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    if (existing.status !== "ISSUED") return NextResponse.json({ error: "Only the current issued prescription can be corrected." }, { status: 409 });
    if (data.patientId !== existing.patientId) return NextResponse.json({ error: "An issued prescription cannot be moved to another patient." }, { status: 400 });
    const patient = await prisma.patient.findFirst({ where: { id: existing.patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, dateOfBirth: true, gender: true, medicalNotes: true, intakeRequests: { where: { drugAllergies: { not: null } }, select: { drugAllergies: true, status: true }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 20 } } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    const appointment = await findVisitForDate(user.clinicId, patient.id, data.prescribedOn);
    const allergies = allergySummaryFrom(patient.intakeRequests, patient.medicalNotes);
    const age = patientAge(patient.dateOfBirth, localDate(data.prescribedOn));
    const warnings = prescriptionWarnings({ items: data.medicationItems, allergies, age });
    if (warnings.length && !data.allergyAcknowledged) return NextResponse.json({ error: "Review and acknowledge the prescription safety warnings before issuing.", warnings }, { status: 409 });

    const prescription = await prisma.$transaction(async (tx) => {
      const encounter = await ensureEncounter(tx, { clinicId: user.clinicId, patientId: patient.id, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(data.prescribedOn), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" });
      const claimed = await tx.prescription.updateMany({ where: { id: existing.id, clinicId: user.clinicId, status: "ISSUED", cancelledAt: null }, data: { status: "SUPERSEDED" } });
      if (claimed.count !== 1) throw new Error("PRESCRIPTION_VERSION_CONFLICT");
      const corrected = await tx.prescription.create({ data: {
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
        version: existing.version + 1,
        supersedesId: existing.id,
        medicationItems: { create: data.medicationItems.map((item, index) => ({ ...item, startDate: item.startDate ? localDate(item.startDate) : null, endDate: item.endDate ? localDate(item.endDate) : null, sortOrder: index })) },
      } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "PRESCRIPTION_CORRECTED", entityType: "PRESCRIPTION", entityId: String(corrected.id), detail: `Issued prescription version ${corrected.version} superseding #${existing.id}`, reason: "Corrected after user confirmation", beforeState: { id: existing.id, version: existing.version }, afterState: { id: corrected.id, version: corrected.version } } });
      return corrected;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(prescription);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the prescription details." }, { status: 400 });
    if (error instanceof Error && (error.message === "PRESCRIPTION_VERSION_CONFLICT" || (error as { code?: string }).code === "P2034")) return NextResponse.json({ error: "This prescription changed in another session. Reload before correcting it." }, { status: 409 });
    return NextResponse.json({ error: "Could not correct prescription." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFeature("clinical");
  if (!user) return response;
  const id = await prescriptionId(params);
  if (!id) return NextResponse.json({ error: "Invalid prescription." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { confirmed?: unknown };
  if (body.confirmed !== true) return NextResponse.json({ error: "Confirm this action." }, { status: 400 });
  const reason = "Cancelled after user confirmation";
  const existing = await prisma.prescription.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null }, select: { id: true, patientId: true } });
  if (!existing) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.prescription.update({ where: { id: existing.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: existing.patientId, actorRole: user.role, action: "PRESCRIPTION_CANCELLED", entityType: "PRESCRIPTION", entityId: String(existing.id), reason } }),
  ]);
  return NextResponse.json({ success: true, cancelled: true });
}
