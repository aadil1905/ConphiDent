export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { loadClinicDocumentBrand } from "@/lib/clinic-document";
import BackLink from "@/components/navigation/BackLink";
import { CasePaperDocument } from "@/components/documents/CasePaperDocument";
import { PrintActions } from "@/components/documents/PrintActions";

/** What PatientIntakeFlow.tsx sends: a JSON array of ticked condition keys. */
function parseConditions(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The signed consent-and-history sheet a patient (or a guardian, on their
 * behalf) fills in and signs — what "case paper" means in this clinic's own
 * paper-file terms.
 *
 * Shown as the document itself, on the clinic's letterhead, rather than as a
 * stack of screen cards summarising it. There is one case paper, and what is
 * on screen is the same sheet that comes out of the printer — which is also
 * why there is no separate print route any more.
 */
export default async function CasePaperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewClinical");
  const { id } = await params;
  const patientId = Number(id);
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
  if (!patient || !clinic) notFound();

  if (!intake) {
    return (
      <div className="mx-auto flex w-full max-w-[50rem] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BackLink
            fallback={`/dashboard/patients/${patient.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            ← Back to the patient
          </BackLink>
        </div>
        <section className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border-strong bg-card px-5.5 py-10 text-center">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
            No consent form on file yet
          </h2>
          <p className="max-w-sm text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            Nobody has filled in {patient.fullName.split(" ")[0]}&rsquo;s medical history and consent yet.
            Send the intake link, or fill it in yourself at the desk.
          </p>
          <Link
            href={`/dashboard/patient-intake?name=${encodeURIComponent(patient.fullName)}&phone=${encodeURIComponent(patient.phone)}`}
            className="mt-1 inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Send the intake form
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="-mx-[clamp(1rem,1.5vw,2rem)] -my-4 min-h-screen bg-background px-3 py-6 text-heading print:bg-white print:p-0">
      <PrintActions backHref={`/dashboard/patients/${patient.id}`} backLabel="← Back to the patient" printLabel="Print case paper" />
      <CasePaperDocument
        clinic={clinic}
        patient={patient}
        record={{
          conditions: parseConditions(intake.medicalHistory),
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
    </div>
  );
}
