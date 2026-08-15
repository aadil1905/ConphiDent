export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, rupees } from "@/lib/format";

const BASE = "/dashboard/clinical-records";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div className="border-t border-border px-4.5 py-3 first:border-t-0">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">{label}</p>
      <p className="mt-1 text-[13px] whitespace-pre-wrap text-foreground">{value}</p>
    </div>
  );
}

export default async function ClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewClinical");
  const recordId = Number((await params).id);
  if (!Number.isInteger(recordId)) notFound();

  const record = await prisma.clinicalRecord.findFirst({
    where: { id: recordId, clinicId: user.clinicId },
    select: {
      id: true,
      visitDate: true,
      chiefComplaint: true,
      diagnosis: true,
      clinicalNotes: true,
      treatmentDone: true,
      medicalHistory: true,
      drugAllergies: true,
      medications: true,
      otherHistory: true,
      dentalHistory: true,
      bloodPressure: true,
      weightKg: true,
      estimateAmount: true,
      consentGiven: true,
      consentNotes: true,
      consentSignedAt: true,
      status: true,
      source: true,
      version: true,
      signedAt: true,
      updatedAt: true,
      enteredInErrorAt: true,
      enteredInErrorReason: true,
      supersedesId: true,
      patientId: true,
      patient: { select: { id: true, fullName: true, phone: true } },
      provider: { select: { name: true } },
      author: { select: { fullName: true } },
      corrections: { select: { id: true, version: true, visitDate: true }, orderBy: { version: "asc" } },
      encounter: {
        select: {
          dentalFindings: { where: { status: "ACTIVE" }, select: { toothCodeSnapshot: true } },
        },
      },
    },
  });
  if (!record) notFound();

  const now = new Date();
  const signed = record.status === "SIGNED";
  const voided = Boolean(record.enteredInErrorAt);
  const teeth = Array.from(
    new Set((record.encounter?.dentalFindings ?? []).map((finding) => finding.toothCodeSnapshot)),
  );
  const canCorrect = can(user.role, "correctClinical");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={BASE} className="text-xs font-semibold text-primary hover:underline">
            ← Notes archive
          </Link>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-[22px] leading-tight font-bold text-heading">
              {record.chiefComplaint || "Visit note"}
            </h1>
            <span
              className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${
                voided
                  ? "bg-danger-bg text-danger"
                  : signed
                    ? "bg-success-bg text-success"
                    : "bg-warning-bg text-warning"
              }`}
            >
              {voided ? "Marked entered in error" : signed ? "Signed" : "Unsigned"}
            </span>
            {record.version > 1 && (
              <span className="inline-flex items-center rounded-pill bg-muted px-2.5 py-1 text-xs font-semibold text-text-muted">
                Version {record.version}
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            <Link
              href={`/dashboard/patients/${record.patientId}?tab=Clinical`}
              className="font-semibold text-primary hover:underline"
            >
              {record.patient.fullName}
            </Link>
            {" · "}
            <span title={exactStamp(record.visitDate)}>{humanTime(record.visitDate, now)}</span>
            {record.provider?.name ? ` · ${record.provider.name}` : ""}
            {record.source === "PATIENT_INTAKE" ? " · filled in by the patient" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!voided && canCorrect && (
            <Link
              href={`${BASE}/${record.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              {signed ? "Correct this note" : "Finish and sign"}
            </Link>
          )}
          <Link
            href={`/dashboard/clinical-workspace/${record.patientId}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Open charting
          </Link>
        </div>
      </header>

      {voided && (
        <p className="rounded-card border border-danger-border bg-danger-bg px-4.5 py-3 text-[13px] font-semibold text-danger">
          This note was marked as entered in error
          {record.enteredInErrorReason ? `: ${record.enteredInErrorReason}` : "."} It is kept so the
          record stays complete, but it no longer counts as the current note.
        </p>
      )}

      {!signed && !voided && (
        <p className="rounded-card border border-warning-border bg-warning-bg px-4.5 py-3 text-[13px] text-warning">
          This note is still a draft. Nobody has signed it off yet.
        </p>
      )}

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-4.5 py-3">
          <h2 className="text-base font-semibold text-heading">What was recorded</h2>
          <span className="text-xs text-text-muted">
            {teeth.length ? `Teeth ${teeth.join(", ")}` : "Not tooth-specific"}
          </span>
        </div>
        <Field label="Why they came" value={record.chiefComplaint} />
        <Field label="What you found" value={record.diagnosis} />
        <Field label="Notes" value={record.clinicalNotes} />
        <Field label="Treatment done" value={record.treatmentDone} />
        <Field label="Dental history" value={record.dentalHistory} />
        <Field
          label="Estimate given"
          value={record.estimateAmount ? rupees(record.estimateAmount) : null}
        />
      </section>

      {(record.medicalHistory || record.drugAllergies || record.medications || record.otherHistory ||
        record.bloodPressure || record.weightKg) && (
        <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="border-b border-border px-4.5 py-3">
            <h2 className="text-base font-semibold text-heading">Medical background</h2>
          </div>
          <Field label="Allergies" value={record.drugAllergies} />
          <Field label="Medicines they take" value={record.medications} />
          <Field label="Medical history" value={record.medicalHistory} />
          <Field label="Anything else" value={record.otherHistory} />
          <Field label="Blood pressure" value={record.bloodPressure} />
          <Field label="Weight" value={record.weightKg ? `${record.weightKg} kg` : null} />
        </section>
      )}

      <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold text-heading">Consent</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          {record.consentGiven
            ? `Given${record.consentSignedAt ? ` on ${exactStamp(record.consentSignedAt)}` : ""}.`
            : "Not recorded on this note."}
          {record.consentNotes ? ` ${record.consentNotes}` : ""}
        </p>
      </section>

      {record.corrections.length > 0 && (
        <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="border-b border-border px-4.5 py-3">
            <h2 className="text-base font-semibold text-heading">Corrections to this note</h2>
            <p className="mt-1 text-[13px] text-text-muted">
              The original is kept exactly as it was signed.
            </p>
          </div>
          {record.corrections.map((correction) => (
            <div
              key={correction.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4.5 py-2.5 first:border-t-0"
            >
              <span className="text-[13px] text-foreground">Version {correction.version}</span>
              <Link
                href={`${BASE}/${correction.id}`}
                className="text-[13px] font-semibold text-primary hover:underline"
              >
                Open version {correction.version}
              </Link>
            </div>
          ))}
        </section>
      )}

      <p className="text-xs text-text-muted">
        {signed && record.signedAt
          ? `Signed ${exactStamp(record.signedAt)}`
          : `Last touched ${exactStamp(record.updatedAt)}`}
        {record.author?.fullName ? ` by ${record.author.fullName}` : ""}.
        {record.supersedesId ? " This version replaces an earlier one." : ""}
      </p>
    </div>
  );
}
