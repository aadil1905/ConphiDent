"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import ImagingActionForm from "@/components/imaging/ImagingActionForm";
import { archiveImagingStudyAction, createImagingComparisonAction, resolveImagingMatchAction, saveImagingReportAction } from "@/app/dashboard/imaging/actions";
import PatientSearchSelect from "@/components/imaging/PatientSearchSelect";

type PatientOption = { id: number; label: string };
type ReviewStudy = {
  id: string;
  modalityLabel: string;
  acquisitionLabel: string;
  patient: { id: number; fullName: string } | null;
  matchStatus: string;
  status: string;
  sourcePatientName: string | null;
  sourcePatientBirthDate: string | null;
  dicomPatientId: string | null;
  accessionNumber: string | null;
  report: { findings: string | null; impression: string | null; version: number } | null;
};

const textarea = "w-full rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none";
const summaryClass = "flex cursor-pointer list-none items-center gap-2 text-[length:var(--text-secondary)] font-semibold text-heading";

export function ImagingReviewActions({ study, canMatch, canSign }: { study: ReviewStudy; canMatch: boolean; canSign: boolean }) {
  return (
    <article className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-heading">{study.modalityLabel}</p>
          <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            {study.patient?.fullName || "No name on it"} · {study.acquisitionLabel}
          </p>
        </div>
        <span className={`rounded-pill px-2.5 py-0.5 text-[length:var(--text-micro)] font-semibold ${study.matchStatus === "UNMATCHED" ? "bg-warning-bg text-warning" : "bg-muted text-heading"}`}>
          {study.matchStatus === "UNMATCHED" ? "Needs a name" : study.status === "REVIEWED" ? "Read" : "Not read yet"}
        </span>
      </div>

      {study.matchStatus === "UNMATCHED" && canMatch ? (
        <details className="mt-3.5 rounded-control border border-warning-border bg-warning-bg p-3.5" open>
          <summary className={summaryClass}>Put a name on this X-ray</summary>
          <dl className="mt-2.5 grid gap-2 text-xs text-foreground sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Name it came with</dt>
              <dd>{study.sourcePatientName || "Nothing given"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Date of birth it came with</dt>
              <dd>{study.sourcePatientBirthDate || "Nothing given"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Machine patient ID</dt>
              <dd>{study.dicomPatientId || "Nothing given"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Accession</dt>
              <dd>{study.accessionNumber || "Nothing given"}</dd>
            </div>
          </dl>
          <ImagingActionForm action={resolveImagingMatchAction} label="This is the patient" pendingLabel="Matching…" className="mt-3.5">
            <input type="hidden" name="studyId" value={study.id} />
            <PatientSearchSelect name="patientId" required />
            <textarea name="reason" required minLength={8} maxLength={500} rows={2} placeholder="How you know it is them (at least 8 characters)" className={`mt-2 ${textarea}`} />
            <label className="mt-2 flex items-start gap-2 text-xs text-foreground">
              <input type="checkbox" name="acknowledgeConflicts" value="1" required className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>I checked the ID, date of birth, accession and study date — not just the name.</span>
            </label>
          </ImagingActionForm>
        </details>
      ) : null}

      {study.matchStatus === "CONFIRMED" && canSign ? (
        <details className="mt-3.5 rounded-control border border-border p-3.5">
          <summary className={summaryClass}>
            {study.report ? `Correct the reading (v${study.report.version})` : "Read it and sign"}
          </summary>
          <ImagingActionForm action={saveImagingReportAction} label={study.report ? "Sign the correction" : "Sign the reading"} pendingLabel="Signing…" className="mt-3.5">
            <input type="hidden" name="studyId" value={study.id} />
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">What you can see
              <textarea name="findings" defaultValue={study.report?.findings || ""} rows={4} maxLength={6000} className={textarea} />
            </label>
            <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-heading">What it means
              <textarea name="impression" defaultValue={study.report?.impression || ""} rows={3} maxLength={3000} className={textarea} />
            </label>
            {study.report ? (
              <label className="mt-3 flex flex-col gap-1.5 text-xs font-semibold text-heading">Why you are changing it
                <textarea name="correctionReason" required minLength={8} maxLength={500} rows={2} className={textarea} />
              </label>
            ) : null}
          </ImagingActionForm>
        </details>
      ) : null}

      {canSign ? (
        <details className="mt-2.5 rounded-control border border-danger-border p-3.5">
          <summary className={`${summaryClass} text-danger`}>This should not be here</summary>
          <p className="mt-1.5 text-xs text-text-muted">
            It leaves the clinical views. The original file, its versions and the trail all stay.
          </p>
          <ImagingActionForm action={archiveImagingStudyAction} label="Take it out of the views" pendingLabel="Recording…" tone="danger" className="mt-3">
            <input type="hidden" name="studyId" value={study.id} />
            <textarea name="reason" required minLength={8} maxLength={500} rows={2} placeholder="Why — this is kept" className={textarea} />
          </ImagingActionForm>
        </details>
      ) : null}
    </article>
  );
}

export function ImagingComparisonForm() {
  const [options, setOptions] = useState<{ studies: { id: string; label: string }[]; plans: { id: number; label: string }[]; procedures: { id: number; label: string }[]; legacyProcedures: { id: number; label: string }[] }>({ studies: [], plans: [], procedures: [], legacyProcedures: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(patient: PatientOption | null) {
    setOptions({ studies: [], plans: [], procedures: [], legacyProcedures: [] });
    setError("");
    if (!patient) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/imaging/comparison-options?patientId=${patient.id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "That didn't load — try again.");
      setOptions({ studies: payload.studies || [], plans: payload.plans || [], procedures: payload.procedures || [], legacyProcedures: payload.legacyProcedures || [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't load — try again.");
    } finally {
      setLoading(false);
    }
  }

  const select = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";

  return (
    <ImagingActionForm action={createImagingComparisonAction} label="Save the comparison" pendingLabel="Saving…" className="grid gap-3">
      <p className="text-[length:var(--text-body)] font-semibold text-heading">Before and after, side by side</p>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Which patient
        <PatientSearchSelect name="comparisonPatientId" required onSelect={load} />
      </label>
      {loading ? (
        <p className="flex items-center gap-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />Finding their X-rays…
        </p>
      ) : null}
      {error ? <p role="alert" className="text-[length:var(--text-secondary)] text-danger">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">The earlier one
          <select name="baselineStudyId" required defaultValue="" className={select}>
            <option value="">Pick the earlier X-ray</option>
            {options.studies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">The later one
          <select name="followupStudyId" required defaultValue="" className={select}>
            <option value="">Pick the later X-ray</option>
            {options.studies.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Treatment plan (optional)
          <select name="treatmentPlanId" defaultValue="" className={select}>
            <option value="">Not linked to a plan</option>
            {options.plans.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Treatment done (optional)
          <select name="completedFindingId" defaultValue="" className={select}>
            <option value="">Not linked to a treatment</option>
            {options.procedures.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            {/* Treatment held only in the older chart. It is shown so the list is
                not silently missing most of what this patient has had done, and
                greyed because a comparison can only point at the newer record. */}
            {options.legacyProcedures.length ? (
              <optgroup label="Recorded before treatments could be linked">
                {options.legacyProcedures.map((item) => <option key={item.id} value="" disabled>{item.label}</option>)}
              </optgroup>
            ) : null}
          </select>
          {options.legacyProcedures.length ? (
            <span className="text-xs font-normal text-text-muted">
              The greyed entries are on the patient&rsquo;s chart but were recorded before treatments
              could be linked to an X-ray. Name them in the note instead.
            </span>
          ) : null}
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">What changed
        <textarea name="note" required minLength={8} maxLength={4000} rows={3} className={textarea} />
      </label>
      <p className="text-xs text-text-muted">
        The patient, the dates, the type and the region are all checked again when you save. Two X-rays
        taken at different angles are never shown as if they line up.
      </p>
    </ImagingActionForm>
  );
}
