export const dynamic = "force-dynamic";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import StatusBadge from "@/components/appointments/StatusBadge";

function formatDay(date: Date) { return date.toISOString().slice(0, 10); }

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireFeature("appointments");
  const user = await requireUser();
  const { week } = await searchParams;
  const start = week ? new Date(`${week}T00:00:00`) : new Date();
  start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const previous = new Date(start); previous.setDate(previous.getDate() - 7); const next = new Date(start); next.setDate(next.getDate() + 7);
  const appointments = await prisma.appointment.findMany({ where: { clinicId: user.clinicId, archivedAt: null, appointmentDate: { gte: start, lt: end } }, select: { id: true, appointmentDate: true, appointmentTime: true, patientName: true, treatment: true, status: true, reminderSentAt: true }, orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }] });
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(date.getDate() + index); return date; });
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">Clinic calendar</h1><p className="mt-1 text-muted-foreground">Weekly appointment schedule and reminder status.</p></div><div className="flex items-center gap-2"><Link href={`/dashboard/calendar?week=${formatDay(previous)}`} className="inline-flex size-10 items-center justify-center rounded-xl border bg-white shadow-sm hover:bg-muted"><ChevronLeft className="size-4" /></Link><span className="min-w-48 text-center text-sm font-semibold">{start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {new Date(end.getTime() - 1).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span><Link href={`/dashboard/calendar?week=${formatDay(next)}`} className="inline-flex size-10 items-center justify-center rounded-xl border bg-white shadow-sm hover:bg-muted"><ChevronRight className="size-4" /></Link></div></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">{days.map((day) => { const key = formatDay(day); const items = appointments.filter((appointment) => formatDay(appointment.appointmentDate) === key); return <section key={key} className="min-h-56 rounded-2xl border bg-white p-4 shadow-sm"><h2 className="border-b border-border/80 pb-3 text-sm font-bold">{day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</h2><div className="mt-3 space-y-3">{items.length === 0 ? <p className="pt-2 text-xs text-muted-foreground">No appointments</p> : items.map((appointment) => <Link key={appointment.id} href={`/dashboard/appointments/${appointment.id}`} className="block rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"><p className="font-bold text-slate-900">{appointment.appointmentTime} · {appointment.patientName}</p><p className="mt-1.5 text-muted-foreground">{appointment.treatment}</p><div className="mt-3 flex flex-col items-start gap-1.5"><StatusBadge status={appointment.status as "Pending" | "Confirmed" | "Completed" | "Cancelled"} /><span className="text-[11px] text-muted-foreground">{appointment.reminderSentAt ? "✓ Reminder sent" : "Reminder not sent"}</span></div></Link>)}</div></section>; })}</div></div>;
}
