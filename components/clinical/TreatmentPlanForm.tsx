"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DENTITION_STAGE_LABELS, isFdiAllowedForStage, STANDARD_FDI_CODES, suggestDentitionStage, toothRowsForStage, type DentitionStage } from "@/lib/dentition";
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
  dateOfBirth?: string | Date | null;
  appointments?: AppointmentVisit[];
};

type Service = { id: number; name: string; price: number | null; active: boolean };

function dateKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));

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

export default function TreatmentPlanForm({
  patients,
  services,
  initialPatientId = "",
  initialToothNumbers = [],
  initialVisit,
  editingPlan,
}: {
  patients: Patient[];
  services: Service[];
  initialPatientId?: string;
  initialToothNumbers?: string[];
  initialVisit?: string;
  editingPlan?: { id: number; patientId: number; visitDate: string | Date | null; title: string; status: string; serviceId: number | null; unitPrice: number | null; estimatedCost: number | null; notes: string | null; selectedTeeth: Array<{ toothNumber: string }>; items: Array<{ id: number; serviceId: number | null; name: string; price: number }> };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [serviceId] = useState(editingPlan?.serviceId ? String(editingPlan.serviceId) : "");
  const [patientId, setPatientId] = useState(editingPlan ? String(editingPlan.patientId) : initialPatientId);
  const [selectedVisitDate, setSelectedVisitDate] = useState(editingPlan?.visitDate ? dateKey(editingPlan.visitDate) : initialVisit || todayKey());
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>(
    (editingPlan?.selectedTeeth.map((tooth) => tooth.toothNumber) || initialToothNumbers).filter((tooth) => STANDARD_FDI_CODES.includes(tooth as (typeof STANDARD_FDI_CODES)[number])),
  );
  const initialCodes = editingPlan?.selectedTeeth.map((tooth) => tooth.toothNumber) || initialToothNumbers;
  const hasPrimary = initialCodes.some((tooth) => /^[5-8]/.test(tooth));
  const hasPermanent = initialCodes.some((tooth) => /^[1-4]/.test(tooth));
  const [dentitionStage, setDentitionStage] = useState<DentitionStage>(hasPrimary && hasPermanent ? "MIXED" : hasPrimary ? "PRIMARY" : "PERMANENT");
  const [items, setItems] = useState<Array<{ serviceId: string; name: string; price: string }>>(
    editingPlan?.items.length ? editingPlan.items.map((item) => ({ serviceId: item.serviceId ? String(item.serviceId) : "", name: item.name, price: String(item.price) })) : [{ serviceId: "", name: "", price: "" }],
  );

  const selectedService = services.find((service) => service.id === Number(serviceId));
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === Number(patientId)),
    [patientId, patients],
  );
  // Every visit on the books, not just the ones already marked off — nothing
  // clinical waits on appointment status.
  const patientVisits = (selectedPatient?.appointments || []).filter(
    (appointment) => appointment.status !== "Cancelled",
  );
  const hasTodayVisit = patientVisits.some(
    (appointment) => dateKey(appointment.appointmentDate) === todayKey(),
  );
  const suggestedStage = suggestDentitionStage(selectedPatient?.dateOfBirth, selectedVisitDate ? `${selectedVisitDate}T12:00:00+05:30` : new Date());
  const availableTeeth = toothRowsForStage(dentitionStage).flatMap((row) => row.teeth);
  const canSave = Boolean(patientId) && !saving;

  function changeDentitionStage(next: DentitionStage) {
    const incompatible = selectedTeeth.filter((tooth) => !isFdiAllowedForStage(tooth, next));
    const before = selectedTeeth;
    const beforeStage = dentitionStage;
    setSelectedTeeth((current) => current.filter((tooth) => isFdiAllowedForStage(tooth, next)));
    setDentitionStage(next);
    // Reversible, so it just happens and the toast offers the way back.
    if (incompatible.length) {
      toast(`${incompatible.join(", ")} came off — those teeth do not exist in this dentition.`, {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            setSelectedTeeth(before);
            setDentitionStage(beforeStage);
          },
        },
      });
    }
  }

  function changePatient(nextPatientId: string) {
    setPatientId(nextPatientId);
    if (selectedTeeth.length > 0) return;
    const nextPatient = patients.find((patient) => patient.id === Number(nextPatientId));
    const nextSuggestion = suggestDentitionStage(nextPatient?.dateOfBirth, selectedVisitDate ? `${selectedVisitDate}T12:00:00+05:30` : new Date());
    if (nextSuggestion) setDentitionStage(nextSuggestion);
  }

  function changeVisitDate(nextVisitDate: string) {
    setSelectedVisitDate(nextVisitDate);
    if (selectedTeeth.length > 0) return;
    const nextSuggestion = suggestDentitionStage(selectedPatient?.dateOfBirth, nextVisitDate ? `${nextVisitDate}T12:00:00+05:30` : new Date());
    if (nextSuggestion) setDentitionStage(nextSuggestion);
  }

  function toggleTooth(tooth: string) {
    setSelectedTeeth((current) =>
      current.includes(tooth) ? current.filter((item) => item !== tooth) : [...current, tooth],
    );
  }

  const { guard, dialog } = useConfirmSubmit({
    title: "Change this plan?",
    body: "What you agreed with the patient before stays in the plan's history, so anyone can see what changed and when.",
    confirmLabel: "Save the change",
    tone: "primary",
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingPlan) {
      const form = event.currentTarget;
      if (form.dataset.confirmed !== "1") return guard(event);
      delete form.dataset.confirmed;
    }

    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const selectedVisitDate = String(form.visitDate || "");

    try {
      const notes = String(form.notes || "").trim();
      const response = await fetch(editingPlan ? `/api/treatment-plans/${editingPlan.id}` : "/api/treatment-plans", {
        method: editingPlan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notes, confirmed: true, items: items.map((item) => ({ serviceId: item.serviceId ? Number(item.serviceId) : null, name: item.name.trim(), price: Number(item.price) })), toothNumbers: selectedTeeth, toothNumber: selectedTeeth[0] || "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success(editingPlan ? "Plan updated." : "Plan saved against that visit.");
      router.push(`/dashboard/patients/${body.patientId}?visit=${selectedVisitDate}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn’t save — your connection dropped. Nothing was lost; try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
      {dialog}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          Patient
          <select
            required
            name="patientId"
            value={patientId}
            onChange={(event) => changePatient(event.target.value)}
            className="min-h-11 w-full rounded-control border border-border bg-card px-3"
          >
            <option value="">Choose a patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName} - {patient.phone}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          Which visit this belongs to
          <select
            required
            name="visitDate"
            value={selectedVisitDate}
            onChange={(event) => changeVisitDate(event.target.value)}
            className="min-h-11 w-full rounded-control border border-border bg-card px-3"
          >
            {!hasTodayVisit && <option value={todayKey()}>Today</option>}
            {patientVisits.map((appointment) => (
              <option key={appointment.id} value={dateKey(appointment.appointmentDate)}>
                {formatVisit(appointment)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          What to call this plan
          <Input required name="title" defaultValue={editingPlan?.title ?? selectedService?.name ?? ""} placeholder="e.g. Root canal treatment" />
        </label>

        <label className="space-y-2 text-sm font-medium">
          Where it stands
          <select name="status" defaultValue={editingPlan?.status ?? "Proposed"} className="min-h-11 w-full rounded-control border border-border bg-card px-3">
            <option value="Proposed">Waiting on a yes</option>
            <option value="Accepted">They said yes</option>
            <option value="In Progress">In progress</option>
            <option value="Completed">Finished</option>
            <option value="Cancelled">They turned it down</option>
          </select>
        </label>

      </div>

      <section className="space-y-3 rounded-card border border-border bg-muted p-4">
        <div><p className="font-semibold text-heading">The work in this plan</p><p className="text-[13px] text-text-muted">Add every treatment you agreed. These same rows and prices go straight onto the invoice.</p></div>
        {items.map((item, index) => <div key={index} className="grid gap-2 rounded-control border border-border bg-card p-3 sm:grid-cols-[1.2fr_1fr_130px_auto] sm:items-end"><label className="text-xs font-medium">Clinic service<select value={item.serviceId} onChange={(event) => { const service = services.find((entry) => entry.id === Number(event.target.value)); setItems((current) => current.map((entry, position) => position === index ? { serviceId: event.target.value, name: service?.name || entry.name, price: service?.price !== null && service?.price !== undefined ? String(service.price) : entry.price } : entry)); }} className="mt-1 min-h-10 w-full rounded-control border border-border bg-card px-2"><option value="">Something else</option>{services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="text-xs font-medium">Treatment<label className="sr-only">Treatment name</label><Input required value={item.name} onChange={(event) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry))} className="mt-1" placeholder="Treatment name" /></label><label className="text-xs font-medium">Price (INR)<Input required type="number" min="0" value={item.price} onChange={(event) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, price: event.target.value } : entry))} className="mt-1" /></label><Button type="button" variant="outline" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>Remove</Button></div>)}
        <div className="flex items-center justify-between"><Button type="button" variant="outline" onClick={() => setItems((current) => [...current, { serviceId: "", name: "", price: "" }])}>+ Add service</Button><p className="font-semibold">Plan total: ₹{items.reduce((sum, item) => sum + (Number(item.price) || 0), 0).toLocaleString("en-IN")}</p></div>
      </section>

      {patientId && (
        <p className="rounded-card border border-border bg-muted p-4 text-[13px] text-text-muted">
          Anything you record now attaches to today&rsquo;s visit when you save.
        </p>
      )}

      <section className="space-y-3 rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-heading">Which teeth</p>
            <p className="text-xs text-text-muted">FDI numbering follows the dentition you confirm. Age only suggests it.</p>
          </div>
          <p className="rounded-pill bg-muted px-3 py-1 text-xs font-medium">{selectedTeeth.length ? selectedTeeth.join(", ") : "Not tooth-specific"}</p>
        </div>
        <input type="hidden" name="dentitionStage" value={dentitionStage} />
        <div className="grid gap-2 sm:grid-cols-3">
          {(["PRIMARY", "MIXED", "PERMANENT"] as DentitionStage[]).map((stage) => <button key={stage} type="button" aria-pressed={dentitionStage === stage} onClick={() => changeDentitionStage(stage)} className={`rounded-control border px-3 py-2 text-sm font-semibold ${dentitionStage === stage ? "border-primary bg-secondary text-heading" : "bg-card"}`}>{DENTITION_STAGE_LABELS[stage]}{suggestedStage === stage ? " · suggested" : ""}</button>)}
        </div>
        <div className={`grid gap-2 ${availableTeeth.length <= 20 ? "grid-cols-5 sm:grid-cols-10" : "grid-cols-4 sm:grid-cols-8"}`}>
          {availableTeeth.map((tooth) => {
            const selected = selectedTeeth.includes(tooth);
            return (
              <button
                key={tooth}
                type="button"
                onClick={() => toggleTooth(tooth)}
                className={`rounded-control border px-3 py-2 text-sm font-semibold transition ${selected ? "border-primary bg-secondary text-heading" : "bg-card text-heading hover:bg-muted"}`}
                aria-pressed={selected}
              >
                {tooth}
              </button>
            );
          })}
        </div>
        {selectedTeeth.length > 0 && (
          <button type="button" onClick={() => setSelectedTeeth([])} className="text-sm font-semibold text-text-muted hover:text-foreground">
            Clear selected teeth
          </button>
        )}
      </section>

      <label className="block space-y-2 text-sm font-medium">
        Anything else worth noting
        <Textarea name="notes" defaultValue={editingPlan?.notes ?? ""} rows={6} placeholder="Timeline, sittings, what you told the patient" />
      </label>

      <div className="flex justify-end gap-3 border-t border-border pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={!canSave}>{saving ? "Saving…" : editingPlan ? "Save the change" : "Save the plan"}</Button>
      </div>
    </form>
  );
}
