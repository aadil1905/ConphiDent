import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppointmentActions from "@/components/appointments/AppointmentActions";
import StatusBadge from "@/components/appointments/StatusBadge";
import type { AppointmentStatus } from "@/types/appointment";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";

type Props = { params: Promise<{ id: string }> };

export default async function AppointmentDetailsPage({ params }: Props) {
  await requireFeature("appointments");
  const user = await requireUser();
  const { id } = await params;
  const appointment = await prisma.appointment.findFirst({
    where: { id: Number(id), clinicId: user.clinicId, archivedAt: null },
    include: { patient: { include: { intakeRequests: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });

  if (!appointment) return <div className="py-20 text-center"><h1 className="text-2xl font-bold">Appointment not found</h1><Link href="/dashboard/appointments" className="mt-4 inline-block text-primary hover:underline">Back to appointments</Link></div>;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Appointments</p><h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Appointment details</h1><p className="mt-1 text-muted-foreground">View and manage appointment information.</p></div>
      <Link href="/dashboard/appointments" className="inline-flex h-10 items-center self-start rounded-xl border border-border bg-card px-4 text-sm font-semibold shadow-sm transition hover:bg-muted">← Back</Link>
    </header>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-lg font-bold tracking-tight">Patient information</h2><dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="text-sm font-medium text-muted-foreground">Patient name</dt><dd className="mt-1 text-lg font-semibold">{appointment.patientName}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Phone</dt><dd className="mt-1 font-semibold">{appointment.phone}</dd></div></dl>{appointment.patientId ? <div className="mt-5 flex flex-wrap gap-2"><Link href={`/dashboard/patients/${appointment.patientId}`} className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-muted">Open patient profile</Link>{appointment.source.toLowerCase() === "whatsapp" && !["COMPLETED", "REVIEWED"].includes(appointment.patient?.intakeRequests[0]?.status || "") ? <Link href={`/dashboard/patient-intake?name=${encodeURIComponent(appointment.patientName)}&phone=${encodeURIComponent(appointment.phone)}`} className="inline-flex h-9 items-center rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700">Continue Patient Intake</Link> : <Link href={`/dashboard/clinical-records/new?patientId=${appointment.patientId}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">Continue medical history</Link>}</div> : null}</section>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-lg font-bold tracking-tight">Appointment</h2><dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5"><div><dt className="text-sm font-medium text-muted-foreground">Date</dt><dd className="mt-1 font-semibold">{appointment.appointmentDate.toLocaleDateString()}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Time</dt><dd className="mt-1 font-semibold">{appointment.appointmentTime}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Reason for visit</dt><dd className="mt-1 font-semibold">{appointment.treatment}</dd></div><div><dt className="text-sm font-medium text-muted-foreground">Status</dt><dd className="mt-2"><StatusBadge status={appointment.status as AppointmentStatus} /></dd></div></dl></section>
    </div>
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-lg font-bold tracking-tight">Actions</h2><div className="mt-5"><AppointmentActions appointment={{ id: appointment.id, patientName: appointment.patientName, phone: appointment.phone, appointmentDate: appointment.appointmentDate.toISOString(), appointmentTime: appointment.appointmentTime, treatment: appointment.treatment, status: appointment.status as AppointmentStatus, notes: appointment.notes }} reminderSentAt={appointment.reminderSentAt?.toISOString() ?? null} /></div></section>
  </div>;
}
