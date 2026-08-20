export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowLeft, FlaskConical, ShieldCheck } from "lucide-react";
import { LabOrderForm } from "@/components/laboratory/LabOrderForm";
import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function NewLaboratoryOrderPage({ searchParams }: { searchParams: Promise<{ patientId?: string; treatmentPlanId?: string }> }) {
  const featureUser = await requireFeature("laboratory");
  const user = await requirePermission("manageLaboratory");
  if (featureUser.clinicId !== user.clinicId) throw new Error("Clinic context mismatch.");
  const raw = await searchParams;
  const requestedPatient = Number(raw.patientId) || 0;
  const requestedPlan = Number(raw.treatmentPlanId) || 0;
  const appointmentCutoff = new Date();
  appointmentCutoff.setDate(appointmentCutoff.getDate() - 1);
  const [patients, laboratories, providers, plans, appointments] = await Promise.all([
    prisma.patient.findMany({ where: { clinicId: user.clinicId, archivedAt: null }, orderBy: { fullName: "asc" }, take: 500, select: { id: true, fullName: true, phone: true } }),
    prisma.laboratory.findMany({ where: { clinicId: user.clinicId, active: true, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, technicianName: true, materials: true, supportedServices: true } }),
    prisma.clinicProvider.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.treatmentPlan.findMany({ where: { clinicId: user.clinicId, cancelledAt: null }, orderBy: { updatedAt: "desc" }, take: 500, select: { id: true, patientId: true, title: true, items: { orderBy: { id: "asc" }, select: { id: true, name: true } } } }),
    prisma.appointment.findMany({ where: { clinicId: user.clinicId, archivedAt: null, appointmentDate: { gte: appointmentCutoff }, patientId: { not: null } }, orderBy: { appointmentDate: "asc" }, take: 500, select: { id: true, patientId: true, appointmentDate: true, treatment: true } }),
  ]);
  const initialPatientId = patients.some((item) => item.id === requestedPatient) ? requestedPatient : undefined;
  const initialPlanId = plans.some((item) => item.id === requestedPlan && (!initialPatientId || item.patientId === initialPatientId)) ? requestedPlan : undefined;

  return <div className="flex flex-col gap-6 pb-12">
    <Link href="/dashboard/laboratory" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="size-4"/>Laboratory worklist</Link>
    <header className="rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]"><div className="flex items-start gap-4"><span className="rounded-control bg-secondary p-3 text-heading"><FlaskConical className="size-6"/></span><div><p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">Private draft</p><h1 className="mt-1 text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading">Send work to the lab</h1><p className="mt-2 max-w-3xl text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">Link the case to the patient, the treatment and any X-rays. A dentist approves it before the lab sees anything, and the lab only ever gets the case number and the clinical scope.</p></div></div></header>
    {laboratories.length ? <section className="rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]"><LabOrderForm patients={patients} laboratories={laboratories} providers={providers} plans={plans} appointments={appointments.map((item) => ({ ...item, appointmentDate: item.appointmentDate.toISOString() }))} requestId={randomUUID()} initialPatientId={initialPatientId} initialPlanId={initialPlanId}/></section> : <section className="rounded-card border border-warning-border bg-warning-bg p-6"><h2 className="font-semibold text-warning">Add a lab first</h2><p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-warning">You need a lab on file, with its data-handling set up, before you can send a case out.</p><Link href="/dashboard/laboratory" className="mt-4 inline-flex rounded-control bg-primary px-4 py-2 text-sm font-semibold text-white">Open directory</Link></section>}
    <p className="flex items-center gap-2 rounded-control bg-success-bg p-4 text-sm text-success"><ShieldCheck className="size-5"/>The patient’s name never leaves the clinic. The lab portal only ever shows the case number and the scope you approve.</p>
  </div>;
}
