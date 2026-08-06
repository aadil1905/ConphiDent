"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

type Service = { id: number; name: string; price: number | null; active: boolean };

const toothNumbers = [
  "11", "12", "13", "14", "15", "16", "17", "18",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "31", "32", "33", "34", "35", "36", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48",
];

function dateKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));

  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

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
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>(
    (editingPlan?.selectedTeeth.map((tooth) => tooth.toothNumber) || initialToothNumbers).filter((tooth) => toothNumbers.includes(tooth)),
  );
  const [items, setItems] = useState<Array<{ serviceId: string; name: string; price: string }>>(
    editingPlan?.items.length ? editingPlan.items.map((item) => ({ serviceId: item.serviceId ? String(item.serviceId) : "", name: item.name, price: String(item.price) })) : [{ serviceId: "", name: "", price: "" }],
  );

  const selectedService = services.find((service) => service.id === Number(serviceId));
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === Number(patientId)),
    [patientId, patients],
  );
  const completedAppointments = (selectedPatient?.appointments || []).filter(
    (appointment) => appointment.status === "Completed",
  );
  const canSave = Boolean(patientId) && completedAppointments.length > 0 && !saving;

  function toggleTooth(tooth: string) {
    setSelectedTeeth((current) =>
      current.includes(tooth) ? current.filter((item) => item !== tooth) : [...current, tooth],
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (completedAppointments.length === 0) {
      toast.error("Complete an appointment first, then save a treatment plan for that visit.");
      return;
    }

    setSaving(true);
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    const selectedVisitDate = String(form.visitDate || "");

    try {
      const notes = String(form.notes || "").trim();
      const response = await fetch(editingPlan ? `/api/treatment-plans/${editingPlan.id}` : "/api/treatment-plans", {
        method: editingPlan ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notes, items: items.map((item) => ({ serviceId: item.serviceId ? Number(item.serviceId) : null, name: item.name.trim(), price: Number(item.price) })), toothNumbers: selectedTeeth, toothNumber: selectedTeeth[0] || "" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success(editingPlan ? "Treatment plan updated." : "Treatment plan saved for the selected appointment date.");
      router.push(`/dashboard/patients/${body.patientId}?visit=${selectedVisitDate}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save treatment plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="clinic-workflow-form space-y-6 rounded-3xl border bg-white p-6 shadow-sm">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          Patient
          <select
            required
            name="patientId"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            className="h-11 w-full rounded-xl border bg-background px-3"
          >
            <option value="">Select patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.fullName} - {patient.phone}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          Completed appointment date
          <select
            required
            name="visitDate"
            defaultValue={editingPlan?.visitDate ? dateKey(editingPlan.visitDate) : initialVisit}
            disabled={completedAppointments.length === 0}
            className="h-11 w-full rounded-xl border bg-background px-3 disabled:bg-muted"
          >
            {completedAppointments.length === 0 ? (
              <option value="">No completed appointments</option>
            ) : (
              completedAppointments.map((appointment) => (
                <option key={appointment.id} value={dateKey(appointment.appointmentDate)}>
                  {formatVisit(appointment)}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          Plan title
          <Input required name="title" defaultValue={editingPlan?.title ?? selectedService?.name ?? ""} placeholder="e.g. Root canal treatment" />
        </label>

        <label className="space-y-2 text-sm font-medium">
          Status
          <select name="status" defaultValue={editingPlan?.status ?? "Proposed"} className="h-11 w-full rounded-xl border bg-background px-3">
            <option>Proposed</option>
            <option>Accepted</option>
            <option>In Progress</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
        </label>

      </div>

      <section className="space-y-3 rounded-2xl border bg-slate-50/70 p-4">
        <div><p className="font-semibold">Treatment services and prices</p><p className="text-sm text-muted-foreground">Add every treatment in this plan. These same rows and prices will appear on the invoice.</p></div>
        {items.map((item, index) => <div key={index} className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1.2fr_1fr_130px_auto] sm:items-end"><label className="text-xs font-medium">Clinic service<select value={item.serviceId} onChange={(event) => { const service = services.find((entry) => entry.id === Number(event.target.value)); setItems((current) => current.map((entry, position) => position === index ? { serviceId: event.target.value, name: service?.name || entry.name, price: service?.price !== null && service?.price !== undefined ? String(service.price) : entry.price } : entry)); }} className="mt-1 h-10 w-full rounded-lg border bg-background px-2"><option value="">Custom service</option>{services.filter((service) => service.active).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="text-xs font-medium">Treatment<label className="sr-only">Treatment name</label><Input required value={item.name} onChange={(event) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, name: event.target.value } : entry))} className="mt-1" placeholder="Treatment name" /></label><label className="text-xs font-medium">Price (INR)<Input required type="number" min="0" value={item.price} onChange={(event) => setItems((current) => current.map((entry, position) => position === index ? { ...entry, price: event.target.value } : entry))} className="mt-1" /></label><Button type="button" variant="outline" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>Remove</Button></div>)}
        <div className="flex items-center justify-between"><Button type="button" variant="outline" onClick={() => setItems((current) => [...current, { serviceId: "", name: "", price: "" }])}>+ Add service</Button><p className="font-semibold">Plan total: Rs. {items.reduce((sum, item) => sum + (Number(item.price) || 0), 0).toLocaleString("en-IN")}</p></div>
      </section>

      {patientId && completedAppointments.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          This patient has no completed appointment yet. Mark the appointment as Completed first, then save a treatment plan.
        </p>
      ) : null}

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Treatment teeth</p>
            <p className="text-xs text-muted-foreground">Choose one or more teeth from the clinical workspace numbering system.</p>
          </div>
          <p className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{selectedTeeth.length ? selectedTeeth.join(", ") : "Not tooth-specific"}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {toothNumbers.map((tooth) => {
            const selected = selectedTeeth.includes(tooth);
            return (
              <button
                key={tooth}
                type="button"
                onClick={() => toggleTooth(tooth)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected ? "border-sky-600 bg-sky-50 text-sky-700 ring-2 ring-sky-100" : "bg-white text-slate-700 hover:bg-muted"}`}
                aria-pressed={selected}
              >
                {tooth}
              </button>
            );
          })}
        </div>
        {selectedTeeth.length > 0 && (
          <button type="button" onClick={() => setSelectedTeeth([])} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Clear selected teeth
          </button>
        )}
      </section>

      <label className="block space-y-2 text-sm font-medium">
        Plan notes
        <Textarea name="notes" defaultValue={editingPlan?.notes ?? ""} rows={6} placeholder="Planned procedures, timeline, patient instructions" />
      </label>

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={!canSave}>{saving ? "Saving..." : editingPlan ? "Update treatment plan" : "Save treatment plan"}</Button>
      </div>
    </form>
  );
}
