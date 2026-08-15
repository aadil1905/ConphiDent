"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmSubmit } from "@/components/ui/confirm-submit";

type AppointmentVisit = {
  id: number;
  appointmentDate: string | Date;
  appointmentTime: string;
  treatment: string;
  status: string;
};

type Patient = {
  id: number;
  fullName: string;
  phone: string;
  appointments?: AppointmentVisit[];
};

type ClinicalRecordFormProps = {
  patients: Patient[];
  selectedPatientId?: number;
  editingRecord?: {
    id: number;
    patientId: number;
    visitDate: string | Date;
    chiefComplaint: string;
    diagnosis: string | null;
    clinicalNotes: string | null;
    medicalHistory: string | null;
    drugAllergies: string | null;
    medications: string | null;
    otherHistory: string | null;
    bloodPressure: string | null;
    weightKg: string | null;
    dentalHistory: string | null;
    treatmentDone: string | null;
    estimateAmount: number | null;
    consentGiven: boolean;
    consentNotes: string | null;
  };
};

const medicalHistoryOptions = [
  "AIDS",
  "Drug Allergies",
  "Heart Condition",
  "Rheumatic Fever",
  "Hypertension",
  "Diabetes",
  "Asthma",
  "Hepatitis",
  "Abnormal Bleeding/Bruising",
  "Kidney Disease",
  "Anemia",
  "Fits/Faints",
  "Infectious Disease",
  "Pregnancy",
  "Medications",
  "Other",
];

function dateKey(date: string | Date) {
  const value = new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
const todayKey = () => dateKey(new Date());

function formatVisit(appointment: AppointmentVisit) {
  const date = new Date(appointment.appointmentDate).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${date} · ${appointment.appointmentTime} · ${appointment.treatment}`;
}

export default function ClinicalRecordForm({ patients, selectedPatientId, editingRecord }: ClinicalRecordFormProps) {
  const router = useRouter();
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const lockedPatientId = selectedPatient?.id;
  const [patientId, setPatientId] = useState(lockedPatientId ? String(lockedPatientId) : "");
  const [saving, setSaving] = useState(false);

  const patient = useMemo(() => patients.find((item) => item.id === Number(patientId)), [patientId, patients]);
  const completedAppointments = patient?.appointments || [];
  const canSave = Boolean(patientId) && !saving;

  const { guard, dialog } = useConfirmSubmit({
    title: "Save this correction?",
    body: "The note you signed before stays in the history exactly as it was — this is added alongside it, and both are visible to anyone who looks.",
    confirmLabel: "Save the correction",
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingRecord) {
      const form = event.currentTarget;
      if (form.dataset.confirmed !== "1") return guard(event);
      delete form.dataset.confirmed;
    }
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      const form = Object.fromEntries(formData.entries());
      const selectedVisitDate = String(form.visitDate || "");
      const response = await fetch(editingRecord ? `/api/clinical-records/${editingRecord.id}` : "/api/clinical-records", {
        method: editingRecord ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          confirmed: true,
          medicalHistory: formData.getAll("medicalHistory").map(String),
          consentGiven: formData.get("consentGiven") === "on",
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success(editingRecord ? "Case paper updated." : "Medical history saved to the selected appointment date.");
      router.push(`/dashboard/patients/${body.patientId}?visit=${selectedVisitDate}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
      {dialog}
      {selectedPatient ? (
        <div className="rounded-control border border-success-border bg-success-bg px-4 py-3 text-sm text-success">
          <p className="font-semibold">Continuing medical history for {selectedPatient.fullName}</p>
          <p className="mt-0.5">It attaches to one visit date — no new visit is created.</p>
        </div>
      ) : null}

      {lockedPatientId ? <input type="hidden" name="patientId" value={lockedPatientId} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          Patient
          <select
            required
            name={lockedPatientId ? undefined : "patientId"}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            disabled={Boolean(lockedPatientId)}
            className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted"
          >
            <option value="">Select patient</option>
            {patients.map((item) => (
              <option key={item.id} value={item.id}>{item.fullName} - {item.phone}</option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          Which visit is this for
            <select required name="visitDate" defaultValue={editingRecord ? dateKey(editingRecord.visitDate) : todayKey()} className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm">
            {completedAppointments.length === 0 ? (
              <option value={todayKey()}>Today</option>
            ) : (
              completedAppointments.map((appointment) => (
                <option key={appointment.id} value={dateKey(appointment.appointmentDate)}>{formatVisit(appointment)}</option>
              ))
            )}
          </select>
        </label>
      </div>

      {patientId && completedAppointments.length === 0 ? (
        <p className="rounded-control border border-border bg-muted px-4 py-3 text-[13px] text-text-muted">
          Anything you record now attaches to today&rsquo;s visit when you save.
        </p>
      ) : null}

      <section className="rounded-control border border-border p-4">
        <div className="mb-3.5">
          <h2 className="text-base font-semibold text-heading">Visit notes</h2>
          <p className="text-[13px] text-text-muted">The main complaint and diagnosis for this visit date.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            Chief complaint
            <Textarea required name="chiefComplaint" defaultValue={editingRecord?.chiefComplaint ?? ""} rows={3} placeholder="Reason for visit" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Diagnosis
            <Textarea name="diagnosis" defaultValue={editingRecord?.diagnosis ?? ""} rows={3} placeholder="Clinical diagnosis" />
          </label>
          <label className="block space-y-2 text-sm font-medium md:col-span-2">
            Clinical notes
            <Textarea name="clinicalNotes" defaultValue={editingRecord?.clinicalNotes ?? ""} rows={5} placeholder="Examination findings, treatment advice, follow-up" />
          </label>
        </div>
      </section>

      <section className="rounded-control border border-border p-4">
        <div className="mb-3.5">
          <h2 className="text-base font-semibold text-heading">Medical history</h2>
          <p className="text-[13px] text-text-muted">Matches the clinic case paper — risk factors show up in Patient 360.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {medicalHistoryOptions.map((option) => (
            <label key={option} className="flex min-h-11 items-center gap-2.5 rounded-control border border-border bg-card px-3.5 text-[13px] font-medium transition-colors hover:bg-muted">
              <input name="medicalHistory" type="checkbox" value={option} defaultChecked={editingRecord ? (editingRecord.medicalHistory ?? "").includes(option) : false} className="size-4 accent-[var(--primary)]" />
              {option}
            </label>
          ))}
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            Blood pressure
            <input name="bloodPressure" defaultValue={editingRecord?.bloodPressure ?? ""} placeholder="Example: 120/80" className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Weight
            <input name="weightKg" defaultValue={editingRecord?.weightKg ?? ""} placeholder="Example: 65 kg" className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Drug allergies
            <Textarea name="drugAllergies" defaultValue={editingRecord?.drugAllergies ?? ""} rows={3} placeholder="Medicine/food allergy details" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Current medications
            <Textarea name="medications" defaultValue={editingRecord?.medications ?? ""} rows={3} placeholder="Current medicines or supplements" />
          </label>
          <label className="block space-y-2 text-sm font-medium md:col-span-2">
            Other medical history
            <Textarea name="otherHistory" defaultValue={editingRecord?.otherHistory ?? ""} rows={3} placeholder="Any other condition, pregnancy notes, surgery history, etc." />
          </label>
        </div>
      </section>

      <section className="rounded-control border border-border p-4">
        <div className="mb-3.5">
          <h2 className="text-base font-semibold text-heading">Dental treatment and estimate</h2>
          <p className="text-[13px] text-text-muted">Saved under the visit date you picked, and shown in Patient 360.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            Dental history
            <Textarea name="dentalHistory" defaultValue={editingRecord?.dentalHistory ?? ""} rows={4} placeholder="Past dental pain, previous treatment, habits, sensitivity, etc." />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Dental treatment done/advised
            <Textarea name="treatmentDone" defaultValue={editingRecord?.treatmentDone ?? ""} rows={4} placeholder="Example: RCT started on 26, cap advised, follow-up after 7 days" />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            Estimate amount
            <input name="estimateAmount" defaultValue={editingRecord?.estimateAmount ?? ""} type="number" min="0" placeholder="Example: 8000" className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm" />
          </label>
        </div>
      </section>

      <section className="rounded-control border border-border p-4">
        <label className="flex items-start gap-2.5 rounded-control border border-success-border bg-success-bg px-3.5 py-3 text-sm font-medium text-success">
          <input name="consentGiven" type="checkbox" defaultChecked={editingRecord?.consentGiven ?? false} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>
            The patient agreed to this
            <span className="mt-0.5 block font-normal">Tick it once the patient or guardian has been through the consent conversation.</span>
          </span>
        </label>
        <label className="mt-4 block space-y-2 text-sm font-medium">
          Consent notes
          <Textarea name="consentNotes" defaultValue={editingRecord?.consentNotes ?? ""} rows={3} placeholder="Consent person, guardian name, procedure explained, signature reference, etc." />
        </label>
      </section>

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={!canSave}>{saving ? "Saving..." : editingRecord ? "Sign corrected version" : "Sign medical history"}</Button>
      </div>
    </form>
  );
}
