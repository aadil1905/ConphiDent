"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import type { StructuredMedication } from "@/lib/prescription-core";

type ManagedTemplate = {
  id: number;
  name: string;
  diagnosis: string | null;
  items: StructuredMedication[];
  active: boolean;
  reviewedAt: string | null;
  updatedAt: string;
};

type Draft = { name: string; diagnosis: string; items: StructuredMedication[] };

const blankMedicine = (): StructuredMedication => ({
  genericName: "",
  brandName: "",
  formulation: "",
  strength: "",
  dosageForm: "Tablet",
  dose: "1",
  doseUnit: "tablet",
  route: "Oral",
  frequency: "Twice daily",
  timing: "",
  mealRelation: "After food",
  startDate: "",
  duration: "5 days",
  endDate: "",
  quantity: "",
  asNeeded: false,
  maxDose: "",
  indication: "",
  instructions: "",
  substitutionAllowed: true,
});

const blankDraft = (): Draft => ({ name: "", diagnosis: "", items: [blankMedicine()] });
const inputClass = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";

export default function PrescriptionTemplateManager({ templates }: { templates: ManagedTemplate[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const gate = useConfirm();
  const selected = templates.find((template) => template.id === selectedId) ?? null;

  function edit(template: ManagedTemplate) {
    setSelectedId(template.id);
    setDraft({
      name: template.name,
      diagnosis: template.diagnosis || "",
      items: template.items.map((item) => ({ ...blankMedicine(), ...item })),
    });
  }

  function startNew() {
    setSelectedId(null);
    setDraft(blankDraft());
  }

  function updateMedicine(index: number, key: keyof StructuredMedication, value: string | boolean) {
    setDraft((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = selectedId === null ? "/api/prescription-templates" : `/api/prescription-templates/${selectedId}`;
      const response = await fetch(endpoint, { method: selectedId === null ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That didn't save — try again.");
      setSelectedId(body.id);
      toast.success(selected?.active === false ? "Set restored and saved." : selectedId === null ? "Set created — it shows up when you prescribe." : "Set updated.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!selectedId || !selected?.active) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/prescription-templates/${selectedId}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That didn't save — try again.");
      toast.success("Set archived. Scripts already written with it are untouched.");
      startNew();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  const chipButton = "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted disabled:opacity-60";

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ConfirmDialog open={gate.open} copy={{ title: `Archive ${selected?.name ?? "this set"}?`, body: "It stops showing up when you prescribe. Scripts already written with it are untouched.", confirmLabel: "Archive it" }} onConfirm={gate.confirm} onCancel={gate.cancel} />

      <aside className="self-start overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)] xl:sticky xl:top-20">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-heading">Your sets</p>
            <p className="text-xs text-text-muted">
              {templates.filter((entry) => entry.active).length} in use · {templates.filter((entry) => !entry.active).length} archived
            </p>
          </div>
          <button type="button" onClick={startNew} className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted">
            <Plus className="size-3.5" aria-hidden />New
          </button>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-3">
          {templates.length ? (
            templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => edit(template)}
                className={`w-full cursor-pointer rounded-control border p-3.5 text-left transition-colors ${selectedId === template.id ? "border-primary bg-secondary-hover" : "border-border hover:bg-muted"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-heading">{template.name}</span>
                  <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${template.active ? "bg-success-bg text-success" : "bg-muted text-text-muted"}`}>
                    {template.active ? "In use" : "Archived"}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-text-muted">
                  {template.diagnosis || "No default diagnosis"} · {template.items.length} medicine{template.items.length === 1 ? "" : "s"}
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-control border border-dashed border-border-strong p-4 text-center text-[13px] text-text-muted">
              No sets yet — build the first one on the right.
            </p>
          )}
        </div>
      </aside>

      <form onSubmit={save} className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold text-heading">{selectedId === null ? "A new set" : selected?.name || "Edit the set"}</h2>
        <p className="mt-0.5 text-[13px] text-text-muted">
          {selected?.active === false
            ? "This set is archived — saving it brings it back."
            : "The diagnosis and every direction load together when someone starts from this set. They still review each dose against the patient."}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">What to call it *
            <input required minLength={3} maxLength={100} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="After an extraction" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2">Diagnosis it usually goes with
            <textarea maxLength={1000} rows={2} value={draft.diagnosis} onChange={(event) => setDraft((current) => ({ ...current, diagnosis: event.target.value }))} className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" placeholder="Loads with the set — edit it on the day" />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-heading">The medicines</h3>
            <p className="text-xs text-text-muted">Keep patient-specific detail out of a reusable set.</p>
          </div>
          <button type="button" onClick={() => setDraft((current) => ({ ...current, items: [...current.items, blankMedicine()] }))} className={chipButton}>
            <Plus className="size-4" aria-hidden />Add one
          </button>
        </div>

        <div className="mt-3.5 flex flex-col gap-3.5">
          {draft.items.map((item, index) => (
            <article key={index} className="rounded-control border border-border p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-heading">Medicine {index + 1}</p>
                <button type="button" disabled={draft.items.length === 1} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))} className="grid size-10 cursor-pointer place-items-center rounded-control border border-danger-border text-danger hover:bg-danger-bg disabled:opacity-40" aria-label={`Take medicine ${index + 1} off`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TemplateField required label="Generic name" value={item.genericName} onChange={(value) => updateMedicine(index, "genericName", value)} />
                <TemplateField label="Brand" value={item.brandName || ""} onChange={(value) => updateMedicine(index, "brandName", value)} />
                <TemplateField required label="Strength" value={item.strength} placeholder="500 mg" onChange={(value) => updateMedicine(index, "strength", value)} />
                <TemplateField required label="Form" value={item.dosageForm} placeholder="Tablet" onChange={(value) => updateMedicine(index, "dosageForm", value)} />
                <TemplateField required label="Dose" value={item.dose} placeholder="1" onChange={(value) => updateMedicine(index, "dose", value)} />
                <TemplateField required label="Unit" value={item.doseUnit} placeholder="tablet" onChange={(value) => updateMedicine(index, "doseUnit", value)} />
                <TemplateField required label="Route" value={item.route} placeholder="Oral" onChange={(value) => updateMedicine(index, "route", value)} />
                <TemplateField required label="How often" value={item.frequency} placeholder="Twice daily" onChange={(value) => updateMedicine(index, "frequency", value)} />
                <TemplateField label="Time of day" value={item.timing || ""} placeholder="08:00 and 20:00" onChange={(value) => updateMedicine(index, "timing", value)} />
                <TemplateField label="Food" value={item.mealRelation || ""} placeholder="After food" onChange={(value) => updateMedicine(index, "mealRelation", value)} />
                <TemplateField required label="For how long" value={item.duration} placeholder="5 days" onChange={(value) => updateMedicine(index, "duration", value)} />
                <TemplateField label="Quantity" value={item.quantity || ""} placeholder="10 tablets" onChange={(value) => updateMedicine(index, "quantity", value)} />
                <TemplateField label="What it is for" value={item.indication || ""} onChange={(value) => updateMedicine(index, "indication", value)} />
                <TemplateField label="Most in a day" value={item.maxDose || ""} onChange={(value) => updateMedicine(index, "maxDose", value)} />
                <label className="flex min-h-11 items-center gap-2 self-end rounded-control border border-border bg-card px-3 text-[13px] font-semibold text-heading">
                  <input type="checkbox" checked={Boolean(item.asNeeded)} onChange={(event) => updateMedicine(index, "asNeeded", event.target.checked)} className="size-4 accent-[var(--primary)]" />Only when needed
                </label>
                <label className="flex min-h-11 items-center gap-2 self-end rounded-control border border-border bg-card px-3 text-[13px] font-semibold text-heading">
                  <input type="checkbox" checked={item.substitutionAllowed !== false} onChange={(event) => updateMedicine(index, "substitutionAllowed", event.target.checked)} className="size-4 accent-[var(--primary)]" />Any brand is fine
                </label>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading sm:col-span-2 lg:col-span-4">Note for the patient
                  <textarea rows={2} maxLength={500} value={item.instructions || ""} onChange={(event) => updateMedicine(index, "instructions", event.target.value)} className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" />
                </label>
              </div>
            </article>
          ))}
        </div>

        <footer className="mt-5 flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-between">
          <div>
            {selected?.active ? (
              <button type="button" onClick={() => gate.ask(() => void archive())} disabled={saving} className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-danger-border bg-card px-4 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-60">
                Archive this set
              </button>
            ) : null}
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={startNew} className={chipButton}>Start over</button>
            <button type="submit" disabled={saving} className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
              {saving ? "Saving…" : selected?.active === false ? "Restore and save" : "Save the set"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function TemplateField({ label, value, required = false, placeholder, onChange }: { label: string; value: string; required?: boolean; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">{label}{required ? " *" : ""}
      <input required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}
