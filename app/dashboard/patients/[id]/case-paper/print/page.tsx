export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { CasePaperDocument } from "@/components/documents/CasePaperDocument";
import { PrintActions } from "@/components/documents/PrintActions";
import { loadClinicDocumentBrand } from "@/lib/clinic-document";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/** What PatientIntakeFlow.tsx sends: a JSON array of ticked condition names. */
function parseConditions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default async function PrintCasePaperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewClinical");
  const patientId = Number((await params).id);
  if (!Number.isInteger(patientId)) notFound();

  const [patient, intake, clinic] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
      select: { id: true, fullName: true, phone: true, dateOfBirth: true, gender: true, address: true },
    }),
    prisma.patientIntakeRequest.findFirst({
      where: { clinicId: user.clinicId, patientId, status: { in: ["COMPLETED", "REVIEWED"] } },
      orderBy: { completedAt: "desc" },
    }),
    loadClinicDocumentBrand(user.clinicId),
  ]);
  // Without a completed intake there is no record to print, and a sheet headed
  // with someone's name over empty answers reads as a record that says nothing
  // rather than one that was never filled in. The blank pad is the surface for
  // a form nobody has answered yet.
  if (!patient || !intake || !clinic) notFound();

  return (
    <main className="min-h-screen bg-background px-3 py-6 text-heading print:bg-white print:p-0">
      <PrintActions backHref={`/dashboard/patients/${patient.id}/case-paper`} backLabel="Back to case paper" printLabel="Print case paper" />
      <CasePaperDocument
        clinic={clinic}
        patient={patient}
        record={{
          conditions: parseConditions(intake.medicalHistory),
          conditionsAsked: intake.medicalHistoryAsked,
          drugAllergies: intake.drugAllergies,
          medications: intake.medications,
          bloodPressure: intake.bloodPressure,
          weightKg: intake.weightKg,
          dentalHistory: intake.dentalHistory,
          otherHistory: intake.otherHistory,
          treatmentDone: intake.treatmentDone,
          estimateAmount: intake.estimateAmount,
          consentGiven: intake.consentGiven,
          consentNotes: intake.consentNotes,
          completedAt: intake.completedAt,
          patientSignature: intake.patientSignature,
          guardianSignature: intake.guardianSignature,
        }}
      />
    </main>
  );
}
