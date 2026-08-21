"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CopyPlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import MedicineCombobox from "@/components/clinical/MedicineCombobox";
import { patientAge, prescriptionWarnings, type StructuredMedication } from "@/lib/prescription-core";
import { useConfirmSubmit } from "@/components/ui/confirm-submit";
import Pending from "@/components/ui/pending";
import { useUnsavedGuard } from "@/components/ui/unsaved-guard";

type AppointmentVisit = { id: number; appointmentDate: string | Date; appointmentTime: string; treatment: string; status: string };
type Patient = { id: number; fullName: string; phone: string; dateOfBirth?: string | Date | null; gender?: string | null; allergySummary?: string | null; appointments?: AppointmentVisit[] };
type Template = { id: number; name: string; diagnosis: string | null; items: StructuredMedication[] };
type EditingPrescription = { id: number; patientId: number; prescribedOn: string | Date; diagnosis: string | null; instructions: string | null; issuePlace?: string | null; medicationItems: Array<StructuredMedication & { id?: number }> };

const blankMedicine = (): StructuredMedication => ({ genericName: "", brandName: "", formulation: "", strength: "", dosageForm: "Tablet", dose: "1", doseUnit: "tablet", route: "Oral", frequency: "Twice daily", timing: "", mealRelation: "After food", startDate: "", duration: "5 days", endDate: "", quantity: "", asNeeded: false, maxDose: "", indication: "", instructions: "", substitutionAllowed: true });
const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";

const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "When needed"];
const DURATIONS = ["3 days", "5 days", "7 days", "10 days"];
const MEALS = ["After food", "Before food"];

function dateKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
const todayKey = () => dateKey(new Date());

function formatVisit(appointment: AppointmentVisit) {
  return `${new Date(appointment.appointmentDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })} · ${appointment.appointmentTime} · ${appointment.treatment}`;
}

function sentenceFor(item: StructuredMedication) {
  if (!item.genericName.trim()) return "Pick a medicine and this line writes itself.";
  const parts = [
    item.genericName.trim(),
    "—",
    item.dose && item.doseUnit ? `${item.dose} ${item.doseUnit},` : "",
    (item.frequency || "twice daily").toLowerCase(),
    (item.mealRelation || "").toLowerCase(),
    item.duration ? `for ${item.duration}` : "",
  ].filter(Boolean);
  return `${parts.join(" ").replace(/\s+/g, " ").trim()}.`;
}

function chipClass(on: boolean) {
  return `min-h-11 cursor-pointer rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap ${
    on ? "border-primary bg-secondary text-heading" : "border-border-strong bg-card text-heading hover:bg-muted"
  }`;
}

export default function PrescriptionForm({ patients, templates = [], initialPatientId, initialVisit, editingPrescription, prescriberReady = true }: { patients: Patient[]; templates?: Template[]; initialPatientId?: number; initialVisit?: string; editingPrescription?: EditingPrescription; prescriberReady?: boolean }) {
  const router = useRouter();
  const { formRef: unsavedFormRef, release: releaseUnsaved, dialog: unsavedDialog } = useUnsavedGuard();
  const [saving, setSaving] = useState(false);
  const [patientId, setPatientId] = useState(editingPrescription ? String(editingPrescription.patientId) : initialPatientId ? String(initialPatientId) : "");
  const [items, setItems] = useState<StructuredMedication[]>(editingPrescription?.medicationItems.length ? editingPrescription.medicationItems : [blankMedicine()]);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [diagnosis, setDiagnosis] = useState(editingPrescription?.diagnosis ?? "");
  const patient = useMemo(() => patients.find((entry) => entry.id === Number(patientId)), [patientId, patients]);
  const completedAppointments = patient?.appointments || [];
  const age = patient?.dateOfBirth ? patientAge(new Date(patient.dateOfBirth)) : null;
  const warnings = useMemo(() => prescriptionWarnings({ items, allergies: patient?.allergySummary, age }), [age, items, patient?.allergySummary]);
  const visibleWarnings = [...new Set([...warnings, ...serverWarnings])];
  const canSave = prescriberReady && Boolean(patientId) && items.every((item) => item.genericName.trim() && item.strength.trim() && item.dosageForm.trim() && item.dose.trim() && item.doseUnit.trim() && item.route.trim() && item.frequency.trim() && item.duration.trim()) && (!visibleWarnings.length || acknowledged) && !saving;

  function update(index: number, key: keyof StructuredMedication, value: string | boolean) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
    setAcknowledged(false); setServerWarnings([]);
  }

  function applyTemplate(template: Template) {
    setItems(template.items.map((item) => ({ ...blankMedicine(), ...item })));
    setDiagnosis(template.diagnosis || "");
    setAcknowledged(false); setServerWarnings([]);
    toast.success(`${template.name} loaded — check every dose before you issue.`);
  }

  async function saveTemplate() {
    if (templateName.trim().length < 3 || items.some((item) => !item.genericName.trim() || !item.strength.trim() || !item.dose.trim() || !item.duration.trim())) return void toast.error("Name the set and finish the medicine lines first.");
    setSavingTemplate(true);
    try {
      const response = await fetch("/api/prescription-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateName, diagnosis: diagnosis.trim(), items }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "That didn't save — try again.");
      toast.success("Saved. It is on the right for next time."); setTemplateName(""); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "That didn't save — try again."); }
    finally { setSavingTemplate(false); }
  }

  const { guard, dialog } = useConfirmSubmit({
    title: "Issue this corrected prescription?",
    body: "The one you issued before stays in the history and keeps its number. The patient gets this new one.",
    confirmLabel: "Issue it",
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingPrescription) {
      const form = event.currentTarget;
      if (form.dataset.confirmed !== "1") return guard(event);
      delete form.dataset.confirmed;
    }

    if (visibleWarnings.length && !acknowledged) return void toast.error("Read the warnings and tick that you have, first.");
    setSaving(true);
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const response = await fetch(editingPrescription ? `/api/prescriptions/${editingPrescription.id}` : "/api/prescriptions", { method: editingPrescription ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, medicationItems: items, allergyAcknowledged: acknowledged, confirmed: true }) });
      const body = await response.json();
      if (!response.ok) { if (Array.isArray(body.warnings)) setServerWarnings(body.warnings); throw new Error(body.error || "That didn't issue — nothing was sent."); }
      releaseUnsaved();
      toast.success(editingPrescription ? "Corrected script issued. The original stays on file." : "Script issued and signed.");
      router.push(`/dashboard/prescriptions/${body.id}/print`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "That didn't save — try again."); }
    finally { setSaving(false); }
  }

  return (
    <form ref={unsavedFormRef} onSubmit={submit} className="grid items-start gap-5">
      {unsavedDialog}
      {dialog}
      <div className="flex min-w-0 flex-col gap-5">
        {!prescriberReady ? (
          <div className="flex flex-col justify-between gap-3 rounded-card border border-warning-border bg-warning-bg px-5.5 py-4 text-sm sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-heading">Finish your prescriber identity first</p>
              <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">Add your registration number before issuing. What you type here stays until you leave the page.</p>
            </div>
            <Link href="/dashboard/prescriptions/profile" className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover">Add it now</Link>
          </div>
        ) : null}

        <section className="rounded-card border border-border bg-card px-5.5 py-3.5 shadow-[var(--shadow)]">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Who this is for</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Patient<span aria-hidden className="font-normal text-danger-mark"> *</span>
              <select required name="patientId" value={patientId} disabled={Boolean(editingPrescription)} onChange={(event) => { setPatientId(event.target.value); setAcknowledged(false); }} className={field}>
                <option value="">Pick the patient</option>
                {patients.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} · {entry.phone}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Which visit<span aria-hidden className="font-normal text-danger-mark"> *</span>
              <select required name="prescribedOn" defaultValue={editingPrescription ? dateKey(editingPrescription.prescribedOn) : initialVisit || todayKey()} className={field}>
                <option value={todayKey()}>Today</option>
                {completedAppointments.map((appointment) => <option key={appointment.id} value={dateKey(appointment.appointmentDate)}>{formatVisit(appointment)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Diagnosis
              <input name="diagnosis" value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} placeholder="e.g. periapical abscess 36" className={field} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Issued at
              <input name="issuePlace" defaultValue={editingPrescription?.issuePlace ?? ""} placeholder="Clinic location" className={field} />
            </label>
          </div>
          {patientId && completedAppointments.length === 0 ? (
            <p className="mt-3 rounded-chip bg-muted px-3 py-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">Anything you record now attaches to today&rsquo;s visit when you save.</p>
          ) : null}
        </section>

        <section className="rounded-card border border-primary/25 bg-card px-5.5 py-4 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The medicines</h2>
              <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">Type three letters — strength, form and route come with the medicine. You only choose how often and how long.</p>
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, blankMedicine()])} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted">
              <Plus className="size-4" aria-hidden />Another medicine
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {items.map((item, index) => (
              <article key={index} className="rounded-control border border-border p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-heading">Medicine {index + 1}</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setItems((current) => [...current, { ...item }])} className="grid size-10 cursor-pointer place-items-center rounded-control border border-border-strong text-heading hover:bg-muted" aria-label={`Add another like medicine ${index + 1}`}><CopyPlus className="size-4" /></button>
                    <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid size-10 cursor-pointer place-items-center rounded-control border border-danger-border text-danger hover:bg-danger-bg disabled:opacity-40" aria-label={`Take medicine ${index + 1} off`}><Trash2 className="size-4" /></button>
                  </div>
                </div>

                {/* Four things do the job. The rest live behind "More options". */}
                <MedicineCombobox
                  value={item.genericName}
                  onType={(text) => update(index, "genericName", text)}
                  onPick={(entry) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, genericName: entry.genericName, strength: entry.strength, dosageForm: entry.dosageForm, doseUnit: entry.doseUnit, route: entry.route, frequency: entry.frequency, duration: entry.duration } : row))}
                />
                <p className="mt-1.5 text-xs text-text-muted">{[item.strength, item.dosageForm, item.route].filter(Boolean).join(" · ") || "Pick a medicine and the strength, form and route fill themselves in."}</p>

                <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-heading">How often</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FREQUENCIES.map((option) => (
                        <button key={option} type="button" aria-pressed={item.frequency === option} className={chipClass(item.frequency === option)}
                          onClick={() => { update(index, "frequency", option); if (option === "When needed") update(index, "asNeeded", true); }}>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-heading">For how long</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DURATIONS.map((option) => (
                        <button key={option} type="button" aria-pressed={item.duration === option} className={chipClass(item.duration === option)} onClick={() => update(index, "duration", option)}>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {MEALS.map((option) => (
                    <button key={option} type="button" aria-pressed={item.mealRelation === option} className={chipClass(item.mealRelation === option).replace("rounded-control", "rounded-pill")} onClick={() => update(index, "mealRelation", option)}>
                      {option}
                    </button>
                  ))}
                  <label className="ml-1 flex min-h-11 items-center gap-2 text-[length:var(--text-secondary)] font-semibold text-heading">
                    <input type="checkbox" checked={Boolean(item.asNeeded)} onChange={(event) => update(index, "asNeeded", event.target.checked)} className="size-4 accent-[var(--primary)]" />
                    Only when needed
                  </label>
                </div>

                <p className="mt-3 rounded-chip bg-muted px-3 py-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">{sentenceFor(item)}</p>

                <details className="mt-3 rounded-control border border-border px-3 py-2.5">
                  <summary className="cursor-pointer text-[length:var(--text-secondary)] font-semibold text-primary">More options — brand, quantity, exact dose, reason</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MedicineField label="How much each time *" value={item.dose} placeholder="1" onChange={(value) => update(index, "dose", value)} />
                    <MedicineField label="Unit *" value={item.doseUnit} placeholder="tablet" onChange={(value) => update(index, "doseUnit", value)} />
                    <MedicineField label="Strength *" value={item.strength} placeholder="500 mg" onChange={(value) => update(index, "strength", value)} />
                    <MedicineField label="Form *" value={item.dosageForm} placeholder="Tablet" onChange={(value) => update(index, "dosageForm", value)} />
                    <MedicineField label="Route *" value={item.route} placeholder="Oral" onChange={(value) => update(index, "route", value)} />
                    <MedicineField label="Brand instead of generic" value={item.brandName || ""} onChange={(value) => update(index, "brandName", value)} />
                    <MedicineField label="How often (your words)" value={item.frequency} placeholder="Twice daily" onChange={(value) => update(index, "frequency", value)} />
                    <MedicineField label="For how long (your words)" value={item.duration} placeholder="5 days" onChange={(value) => update(index, "duration", value)} />
                    <MedicineField label="Time of day" value={item.timing || ""} placeholder="08:00 and 20:00" onChange={(value) => update(index, "timing", value)} />
                    <MedicineField label="Quantity to dispense" value={item.quantity || ""} placeholder="10 tablets" onChange={(value) => update(index, "quantity", value)} />
                    <MedicineField label="Why it is prescribed" value={item.indication || ""} placeholder="e.g. post-extraction cover" onChange={(value) => update(index, "indication", value)} />
                    <MedicineField label="Most in a day" value={item.maxDose || ""} placeholder="Max 3 a day" onChange={(value) => update(index, "maxDose", value)} />
                    <label className="flex min-h-11 items-center gap-2 self-end rounded-control border border-border bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading sm:col-span-2">
                      <input type="checkbox" checked={item.substitutionAllowed !== false} onChange={(event) => update(index, "substitutionAllowed", event.target.checked)} className="size-4 accent-[var(--primary)]" />
                      Any brand is fine
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2 lg:col-span-4">Note for the patient
                      <textarea value={item.instructions || ""} onChange={(event) => update(index, "instructions", event.target.value)} rows={2} maxLength={500} className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" placeholder="How to take it, when to stop, what to watch for" />
                    </label>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>

        {visibleWarnings.length ? (
          <section role="alert" className="rounded-card border border-danger-border bg-danger-bg px-5.5 py-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-danger">Read before you issue</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[length:var(--text-secondary)] text-danger">
                  {visibleWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
                <label className="mt-3 flex items-start gap-2 rounded-chip bg-card px-3 py-2.5 text-[length:var(--text-secondary)] font-semibold text-heading">
                  <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span>I read these against the patient&rsquo;s record and this script is what I intend.</span>
                </label>
              </div>
            </div>
          </section>
        ) : (
          <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">No allergy, duplicate or age warnings on this script. Your judgment still applies.</p>
        )}

        <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Advice printed under the medicines
            <textarea name="instructions" defaultValue={editingPrescription?.instructions ?? ""} rows={3} placeholder="Rinse with warm saline from tomorrow. Call us if the swelling gets worse." className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" />
          </label>
        </section>

        <footer className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted">Go back</button>
          <button type="submit" disabled={!canSave} aria-busy={saving} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Pending label="Issuing…" /> : editingPrescription ? "Issue the corrected version" : "Issue the script"}
          </button>
        </footer>
      </div>

      <aside className="flex flex-col gap-6">
        {patient ? (
          <div className="rounded-card border border-danger-border bg-danger-bg px-4 py-3.5">
            <p className="mb-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-bold text-danger">Careful with</p>
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-danger">
              {patient.allergySummary || "No allergies on file — still ask before you issue."}
              {age !== null ? ` · ${age} years` : " · age not recorded"}
              {patient.gender ? ` · ${patient.gender}` : ""}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
          <p className="text-[length:var(--text-body)] font-semibold text-heading">Start from a set</p>
          <p className="text-xs text-text-muted">Your clinic&rsquo;s usual combinations. You can edit anything after.</p>
          {templates.length === 0 ? (
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">No sets yet — save the script below and it appears here.</p>
          ) : (
            templates.map((template) => (
              <button key={template.id} type="button" onClick={() => applyTemplate(template)} className="cursor-pointer rounded-control border border-border-strong bg-card px-3 py-2.5 text-left hover:bg-muted">
                <span className="block text-[length:var(--text-secondary)] font-semibold text-heading">{template.name}</span>
                <span className="block text-xs text-text-muted">{template.diagnosis || `${template.items.length} ${template.items.length === 1 ? "medicine" : "medicines"}`}</span>
              </button>
            ))
          )}
          <div className="mt-1 border-t border-border pt-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">Save this script as a set
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. After an extraction" className={field} />
            </label>
            <button type="button" onClick={saveTemplate} disabled={savingTemplate} className="mt-2 w-full cursor-pointer rounded-control border border-border-strong bg-card px-3 py-2.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted disabled:opacity-60">
              {savingTemplate ? "Saving…" : "Save the set"}
            </button>
            <Link href="/dashboard/prescriptions/templates" className="mt-2 inline-block text-[length:var(--text-secondary)] font-semibold text-primary hover:underline">Manage your sets</Link>
          </div>
        </div>

        {/* Grows as the script does, so you can see what the patient gets
            without leaving the form. */}
        <div className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
          <p className="text-[length:var(--text-body)] font-semibold text-heading">What they will get</p>
          <p className="text-xs text-text-muted">
            {patient ? `Printed for ${patient.fullName}.` : "Pick a patient and this fills in."} It
            reads exactly like this on the printed script.
          </p>
          <ol className="flex flex-col gap-2.5">
            {items.map((item, index) => (
              <li key={index} className="border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                <span className="block text-[length:var(--text-secondary)] font-semibold text-heading">
                  {item.genericName.trim()
                    ? `${index + 1}. ${item.genericName.trim()}${item.strength ? ` ${item.strength}` : ""}`
                    : `${index + 1}. Nothing picked yet`}
                </span>
                <span className="block text-xs text-text-muted">{sentenceFor(item)}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </form>
  );
}

function MedicineField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">{label.replace(" *", "")}{label.endsWith("*") ? <span aria-hidden className="font-normal text-danger-mark"> *</span> : null}
      <input required={label.endsWith("*")} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={field} />
    </label>
  );
}
