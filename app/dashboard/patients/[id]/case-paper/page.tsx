export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp } from "@/lib/format";
import BackLink from "@/components/navigation/BackLink";
import { conditionLabel } from "@/lib/medical-history";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The signed consent-and-history sheet a patient (or a guardian, on their
 * behalf) fills in and signs — what "case paper" means in this clinic's own
 * paper-file terms. Its own page, holding nothing else, so it can be handed
 * to someone or printed without the rest of the record around it.
 */
export default async function CasePaperPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewClinical");
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId)) notFound();

  const [patient, intake] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
      select: { id: true, fullName: true, phone: true, dateOfBirth: true, gender: true, address: true },
    }),
    prisma.patientIntakeRequest.findFirst({
      where: { clinicId: user.clinicId, patientId, status: { in: ["COMPLETED", "REVIEWED"] } },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  if (!patient) notFound();

  const age = patient.dateOfBirth ? new Date().getFullYear() - patient.dateOfBirth.getFullYear() : null;
  // Stored as stable keys since the printed and digital lists were unified, so
  // the screen has to render them back through the same list the sheet uses —
  // otherwise this page shows "hypertension" where the pad shows "Hypertension".
  const conditions = parseConditions(intake?.medicalHistory ?? null).map(
    (entry) => conditionLabel(entry) ?? entry,
  );

  return (
    <div className="mx-auto flex w-full max-w-[50rem] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink
          fallback={`/dashboard/patients/${patient.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
        >
          ← Back to the patient
        </BackLink>
        {/* The printed sheet is the clinic's own letterheaded record, not this
            screen with its chrome hidden — so this hands over to the document
            route the way prescriptions and bills already do. */}
        {intake && (
          <Link
            href={`/dashboard/patients/${patient.id}/case-paper/print`}
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Print case paper
          </Link>
        )}
      </div>

      <header className="flex flex-col gap-1 rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">Case paper</p>
        <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold text-heading">
          {patient.fullName}
        </h1>
        <p className="text-[length:var(--text-secondary)] text-text-muted">
          {[age !== null && `${age} y`, patient.gender, patient.phone, patient.address]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {!intake ? (
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
      ) : (
        <>
          <Section title="Medical history">
            {conditions.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {conditions.map((name) => (
                  <li
                    key={name}
                    className="rounded-pill border border-warning-border bg-warning-bg px-3 py-1 text-[length:var(--text-secondary)] font-semibold text-warning"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[length:var(--text-body)] text-text-muted">Nothing ticked.</p>
            )}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-heading">Allergies</dt>
                <dd className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
                  {intake.drugAllergies || "None recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-heading">Current medication</dt>
                <dd className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
                  {intake.medications || "None recorded"}
                </dd>
              </div>
              {/* Fields from the retired three-step wizard — absent on anything
                  filled in through the current one-page form, so only shown
                  when an older record actually has them. */}
              {intake.bloodPressure && (
                <div>
                  <dt className="text-xs font-semibold text-heading">Blood pressure</dt>
                  <dd className="text-[length:var(--text-body)] text-foreground">{intake.bloodPressure}</dd>
                </div>
              )}
              {intake.weightKg && (
                <div>
                  <dt className="text-xs font-semibold text-heading">Weight</dt>
                  <dd className="text-[length:var(--text-body)] text-foreground">{intake.weightKg} kg</dd>
                </div>
              )}
              {intake.dentalHistory && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-heading">Dental history</dt>
                  <dd className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">{intake.dentalHistory}</dd>
                </div>
              )}
              {intake.otherHistory && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-heading">Anything else</dt>
                  <dd className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">{intake.otherHistory}</dd>
                </div>
              )}
            </dl>
          </Section>

          <Section title="Consent">
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
              {intake.consentGiven
                ? "Consented to examination and treatment at this clinic."
                : "Consent was not given."}
            </p>
            {intake.consentNotes && (
              <p className="text-[length:var(--text-secondary)] text-text-muted">{intake.consentNotes}</p>
            )}
            <p className="text-xs text-text-muted">
              {intake.completedAt ? `Submitted ${exactStamp(intake.completedAt)}` : "Submission time not recorded"}
            </p>
          </Section>

          <Section title="Signature">
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-heading">Patient</p>
                {intake.patientSignature ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a stored data: URI, not an optimizable remote asset
                  <img
                    src={intake.patientSignature}
                    alt={`${patient.fullName}'s signature`}
                    className="h-[90px] w-[300px] rounded-control border border-border bg-white object-contain"
                  />
                ) : (
                  <p className="text-[length:var(--text-body)] text-text-muted">Not signed</p>
                )}
              </div>
              {intake.guardianSignature && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-heading">Guardian</p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a stored data: URI, not an optimizable remote asset */}
                  <img
                    src={intake.guardianSignature}
                    alt="Guardian's signature"
                    className="h-[90px] w-[300px] rounded-control border border-border bg-white object-contain"
                  />
                </div>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
