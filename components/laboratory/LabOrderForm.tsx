"use client";

import { useMemo, useState } from "react";
import { createLabCaseAction } from "@/app/dashboard/laboratory/actions";
import { LabActionForm } from "@/components/laboratory/LabActionForm";

type Patient = { id: number; fullName: string; phone: string };
type Laboratory = { id: number; name: string; technicianName: string | null; materials: string[]; supportedServices: string[] };
type Provider = { id: number; name: string };
type Plan = { id: number; patientId: number; title: string; items: Array<{ id: number; name: string }> };
type Appointment = { id: number; patientId: number | null; appointmentDate: string; treatment: string };

const input = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm";
const area = "min-h-24 w-full rounded-control border border-border bg-card px-3 py-2 text-sm";

export function LabOrderForm({ patients, laboratories, providers, plans, appointments, requestId, initialPatientId, initialPlanId }: { patients: Patient[]; laboratories: Laboratory[]; providers: Provider[]; plans: Plan[]; appointments: Appointment[]; requestId: string; initialPatientId?: number; initialPlanId?: number }) {
  const [patientId, setPatientId] = useState(initialPatientId ? String(initialPatientId) : "");
  const [planId, setPlanId] = useState(initialPlanId ? String(initialPlanId) : "");
  const patientPlans = useMemo(() => plans.filter((plan) => !patientId || plan.patientId === Number(patientId)), [patientId, plans]);
  const planItems = plans.find((plan) => plan.id === Number(planId))?.items || [];
  const patientAppointments = appointments.filter((appointment) => appointment.patientId === Number(patientId));
  return <LabActionForm action={createLabCaseAction} label="Create draft order" pendingLabel="Creating draft..." navigateToCase className="grid gap-5" buttonClassName="h-12 rounded-control bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">
    <input type="hidden" name="idempotencyKey" value={requestId}/>
    <fieldset className="grid gap-4 rounded-card border p-5 sm:grid-cols-2"><legend className="px-2 font-bold">Patient and clinical context</legend>
      <label className="text-sm font-semibold">Patient<select required name="patientId" value={patientId} onChange={(event) => { setPatientId(event.target.value); setPlanId(""); }} className={`${input} mt-1`}><option value="">Choose patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.fullName} · {patient.phone}</option>)}</select></label>
      <label className="text-sm font-semibold">Responsible dentist<select name="providerId" className={`${input} mt-1`}><option value="">Current signed-in clinician</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
      <label className="text-sm font-semibold">Treatment plan<select name="treatmentPlanId" value={planId} onChange={(event) => setPlanId(event.target.value)} className={`${input} mt-1`}><option value="">No plan link</option>{patientPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>
      <label className="text-sm font-semibold">Treatment-plan item<select name="treatmentPlanItemId" className={`${input} mt-1`}><option value="">No specific item</option>{planItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-semibold sm:col-span-2">Relevant patient appointment<select name="appointmentId" className={`${input} mt-1`}><option value="">No appointment link</option>{patientAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{new Date(appointment.appointmentDate).toLocaleDateString("en-IN")} · {appointment.treatment}</option>)}</select></label>
    </fieldset>
    <fieldset className="grid gap-4 rounded-card border p-5 sm:grid-cols-2"><legend className="px-2 font-bold">Laboratory and work authorization</legend>
      <label className="text-sm font-semibold">Laboratory<select required name="labId" className={`${input} mt-1`}><option value="">Choose laboratory</option>{laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}{lab.technicianName ? ` · ${lab.technicianName}` : ""}</option>)}</select></label>
      <label className="text-sm font-semibold">Technician override<input name="technician" maxLength={160} className={`${input} mt-1`} placeholder="Optional named technician"/></label>
      <label className="text-sm font-semibold">Procedure or appliance<input required name="caseType" maxLength={160} className={`${input} mt-1`} placeholder="Crown, bridge, aligner, denture…"/></label>
      <label className="text-sm font-semibold">Restoration type<input name="restorationType" maxLength={160} className={`${input} mt-1`} placeholder="Monolithic crown, framework…"/></label>
      <label className="text-sm font-semibold">FDI tooth numbers<input name="teeth" className={`${input} mt-1`} placeholder="11, 12, 46"/></label>
      <label className="text-sm font-semibold">Anatomical or appliance scope<input name="anatomicalScope" maxLength={240} className={`${input} mt-1`} placeholder="Full upper arch, maxillary anterior…"/></label>
      <label className="text-sm font-semibold">Material<input required name="material" maxLength={160} className={`${input} mt-1`} placeholder="Zirconia, E-max, Co-Cr…"/></label>
      <label className="text-sm font-semibold">Shade and system<div className="mt-1 grid grid-cols-2 gap-2"><input name="shade" maxLength={80} className={input} placeholder="A2"/><input name="shadeSystem" maxLength={120} className={input} placeholder="VITA Classical"/></div></label>
      <label className="text-sm font-semibold">Margin design<input name="marginDesign" maxLength={160} className={`${input} mt-1`} placeholder="Shoulder, chamfer…"/></label>
      <label className="text-sm font-semibold">Pontic design<input name="ponticDesign" maxLength={160} className={`${input} mt-1`} placeholder="Modified ridge lap…"/></label>
      <label className="text-sm font-semibold">Implant system<input name="implantSystem" maxLength={160} className={`${input} mt-1`} placeholder="System and platform"/></label>
      <label className="text-sm font-semibold">Implant components<input name="implantComponents" maxLength={500} className={`${input} mt-1`} placeholder="Abutment, scan body, screw…"/></label>
      <label className="text-sm font-semibold">Occlusion instructions<textarea name="occlusionNotes" maxLength={1000} className={`${area} mt-1`}/></label>
      <label className="text-sm font-semibold">Bite / design instructions<textarea name="biteNotes" maxLength={1000} className={`${area} mt-1`}/></label>
      <div className="sm:col-span-2"><p className="text-sm font-semibold">Requested checkpoints</p><div className="mt-2 flex flex-wrap gap-3">{["DESIGN_PREVIEW","WAX_TRY_IN","METAL_TRY_IN","BISQUE_TRY_IN","FINAL_APPROVAL"].map((stage) => <label key={stage} className="flex items-center gap-2 rounded-control border px-3 py-2 text-sm"><input type="checkbox" name="requestedStages" value={stage}/>{stage.replaceAll("_", " ").toLowerCase()}</label>)}</div></div>
    </fieldset>
    <fieldset className="grid gap-4 rounded-card border p-5 sm:grid-cols-2"><legend className="px-2 font-bold">Dates, priority, and logistics</legend>
      <label className="text-sm font-semibold">Required in clinic<input required name="dueDate" type="date" className={`${input} mt-1`}/></label>
      <label className="text-sm font-semibold">Patient appointment date<input name="patientAppointmentAt" type="date" className={`${input} mt-1`}/></label>
      <label className="text-sm font-semibold">Priority<select name="priority" className={`${input} mt-1`}><option value="NORMAL">Normal</option><option value="URGENT">Urgent — reason in instructions</option></select></label>
      <label className="text-sm font-semibold">Previous case reference<input name="previousCaseReference" maxLength={160} className={`${input} mt-1`}/></label>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="pickupRequired" value="1"/> Laboratory pickup is required</label>
      <label className="text-sm font-semibold sm:col-span-2">Pickup instructions<input name="pickupInstructions" maxLength={500} className={`${input} mt-1`}/></label>
      <label className="text-sm font-semibold sm:col-span-2">Special instructions<textarea name="notes" maxLength={4000} className={`${area} mt-1`} placeholder="Minimum necessary clinical instructions; do not repeat patient contact details."/></label>
    </fieldset>
    <p className="rounded-control bg-secondary p-4 text-sm text-primary">This creates a private draft only. A dentist must review and approve it before any laboratory link is issued.</p>
  </LabActionForm>;
}

