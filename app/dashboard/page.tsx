export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowUpRight,
  BotMessageSquare,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  IndianRupee,
  MessageCircle,
  Plus,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
  WalletCards,
  ListChecks,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import StatusBadge from "@/components/appointments/StatusBadge";
import DentalOdontogram from "@/components/dashboard/DentalOdontogram";
import type { AppointmentStatus } from "@/types/appointment";

function startOfDay(input = new Date()) {
  const value = new Date(input);
  value.setHours(0, 0, 0, 0);
  return value;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function safeDashboardQuery<T>(
  label: string,
  fallback: T,
  query: () => Promise<T>
) {
  try {
    return await query();
  } catch (error) {
    console.error(`Dashboard query failed: ${label}`, error);
    return fallback;
  }
}

export default async function DashboardPage() {
  const user = await requireUser();

  const today = startOfDay();

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const monthStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  const recentStart = new Date(today);
  recentStart.setDate(recentStart.getDate() - 30);

  const [
    todayAppointments,
    totalPatients,
    newPatients,
    treatmentPlans,
    invoiceTotals,
    payments,
    pendingAppointments,
    recentConversations,
    overdueFollowUps,
    newLeadCount,
    openConversationCount,
    delayedLabCount,
    inventoryItems,
  ] = await Promise.all([
    safeDashboardQuery("today appointments", [], () => prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        appointmentDate: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          not: "Cancelled",
        },
      },
      orderBy: {
        appointmentTime: "asc",
      },
      take: 7,
      select: {
        id: true,
        appointmentTime: true,
        patientName: true,
        treatment: true,
        status: true,
      },
    })),

    safeDashboardQuery("total patients", 0, () => prisma.patient.count({ where: { clinicId: user.clinicId } })),

    safeDashboardQuery("new patients", 0, () => prisma.patient.count({
      where: {
        clinicId: user.clinicId,
        createdAt: {
          gte: recentStart,
        },
      },
    })),

    safeDashboardQuery("treatment plans", 0, () => prisma.treatmentPlan.count({
      where: {
        patient: { clinicId: user.clinicId },
        createdAt: {
          gte: monthStart,
        },
      },
    })),

    safeDashboardQuery("monthly invoice totals", { _sum: { totalAmount: 0 } }, () => prisma.invoice.aggregate({
      where: {
        patient: { clinicId: user.clinicId },
        issueDate: {
          gte: monthStart,
        },
      },
      _sum: { totalAmount: true },
    })),

    safeDashboardQuery("monthly payments", { _sum: { amount: 0 } }, () => prisma.payment.aggregate({
      where: {
        invoice: { patient: { clinicId: user.clinicId } },
        paidAt: {
          gte: monthStart,
        },
      },
      _sum: {
        amount: true,
      },
    })),

    safeDashboardQuery("pending appointments", [], () => prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        status: "Pending",
      },
      orderBy: [
        {
          appointmentDate: "asc",
        },
        {
          appointmentTime: "asc",
        },
      ],
      take: 4,
      select: { id: true },
    })),

    safeDashboardQuery("recent WhatsApp conversations", [], () => prisma.whatsAppConversation.findMany({
      where: {
        clinicId: user.clinicId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
      take: 4,
      select: {
        id: true,
        phone: true,
        messages: {
          select: { content: true },
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },
    })),
    safeDashboardQuery("overdue follow-ups", 0, () => prisma.followUpTask.count({
      where: { clinicId: user.clinicId, status: "PENDING", scheduledFor: { lte: new Date() } },
    })),
    safeDashboardQuery("new leads", 0, () => prisma.lead.count({ where: { clinicId: user.clinicId, stage: "NEW" } })),
    safeDashboardQuery("open conversations", 0, () => prisma.whatsAppConversation.count({ where: { clinicId: user.clinicId, status: "OPEN" } })),
    safeDashboardQuery("delayed lab cases", 0, () => prisma.labCase.count({ where: { clinicId: user.clinicId, dueDate: { lt: today }, status: { notIn: ["COMPLETED", "CANCELLED", "DELIVERED"] } } })),
    safeDashboardQuery("inventory items", [], () => prisma.inventoryItem.findMany({ where: { clinicId: user.clinicId, active: true }, select: { quantity: true, reorderLevel: true } })),

  ]);

  const production = invoiceTotals._sum.totalAmount ?? 0;

  const collections = payments._sum.amount ?? 0;
  const lowStockCount = inventoryItems.filter((item) => item.quantity <= item.reorderLevel).length;

  const stats = [
    {
      label: "Appointments today",
      value: todayAppointments.length,
      note: "Open schedule",
      href: "/dashboard/calendar",
      icon: CalendarDays,
      tone: "from-indigo-100 to-violet-50 text-indigo-600",
    },
    {
      label: "New patients",
      value: newPatients,
      note: "Last 30 days",
      href: "/dashboard/patients",
      icon: UserPlus,
      tone: "from-sky-100 to-cyan-50 text-sky-600",
    },
    {
      label: "Treatment plans",
      value: treatmentPlans,
      note: "Created this month",
      href: "/dashboard/treatment-plans",
      icon: Stethoscope,
      tone: "from-violet-100 to-fuchsia-50 text-violet-600",
    },
    {
      label: "Production (MTD)",
      value: `₹${production.toLocaleString("en-IN")}`,
      note: "Invoices issued",
      href: "/dashboard/billing",
      icon: IndianRupee,
      tone: "from-amber-100 to-orange-50 text-amber-600",
    },
    {
      label: "Collections (MTD)",
      value: `₹${collections.toLocaleString("en-IN")}`,
      note: "Payments received",
      href: "/dashboard/billing",
      icon: WalletCards,
      tone: "from-emerald-100 to-teal-50 text-emerald-600",
    },
  ];

  return (
    <div className="dashboard-enter mx-auto max-w-[1700px] space-y-6 pb-8">

      {/* Greeting Header */}
      <section className="workspace-card flex flex-col justify-between gap-6 px-5 py-5 sm:px-6 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
            Clinic command centre
          </p>

          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            Today at a glance
          </h1>

          <p className="mt-2 text-slate-600">
            Prioritise patient care, booking recovery, and revenue-critical work.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/appointments/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-600 px-5 text-sm font-bold text-white shadow-lg shadow-sky-300/40 transition hover:-translate-y-0.5"
          >
            <Plus className="size-4" />
            New appointment
          </Link>

          <Link
            href="/dashboard/leads"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
          >
            <UserPlus className="size-4" />
            Review leads
          </Link>
          <Link
            href="/dashboard/huddle"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-800 transition hover:bg-slate-50"
          >
            <ListChecks className="size-4" />
            Today&apos;s priorities
          </Link>
        </div>
      </section>

      <section className="grid gap-3 rounded-xl border border-amber-100 bg-amber-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-bold text-slate-900">Front-desk focus</p>
          <p className="mt-1 text-sm text-slate-600">Confirm pending bookings, recover overdue follow-ups, and keep every patient record up to date.</p>
        </div>
        <Link href="/dashboard/follow-ups" className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700">
          {overdueFollowUps} overdue follow-up{overdueFollowUps === 1 ? "" : "s"}
        </Link>
      </section>

      <section className="workspace-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[.14em] text-primary">Attention board</p><h2 className="mt-1 text-xl font-bold text-slate-950">What needs action today</h2></div><Link href="/dashboard/huddle" className="workspace-link">Open daily huddle <ChevronRight className="size-4"/></Link></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Recovery tasks", value: overdueFollowUps, href: "/dashboard/follow-ups", tone: "bg-amber-50 text-amber-800" },
            { label: "New enquiries", value: newLeadCount, href: "/dashboard/leads", tone: "bg-violet-50 text-violet-800" },
            { label: "Open conversations", value: openConversationCount, href: "/dashboard/conversations", tone: "bg-sky-50 text-sky-800" },
            { label: "Delayed lab cases", value: delayedLabCount, href: "/dashboard/laboratory", tone: "bg-rose-50 text-rose-800" },
            { label: "Low-stock items", value: lowStockCount, href: "/dashboard/operations", tone: "bg-orange-50 text-orange-800" },
          ].map((item) => <Link key={item.label} href={item.href} className="workspace-card workspace-card--interactive flex items-center justify-between gap-3 rounded-xl p-4"><span className="text-sm font-semibold text-slate-700">{item.label}</span><span className={`grid size-9 place-items-center rounded-full text-sm font-bold ${item.tone}`}>{item.value}</span></Link>)}
        </div>
      </section>

      {/* Stats */}
      <section className="dashboard-kpi-grid">
        {stats.map(
          ({
            label,
            value,
            note,
            href,
            icon: Icon,
            tone,
          }) => (
            <Link
              key={label}
              href={href}
              className="workspace-card workspace-card--interactive group dashboard-kpi-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="min-h-10 text-sm font-semibold leading-5 text-slate-600">
                    {label}
                  </p>

                  <p className="mt-2 truncate text-3xl font-bold leading-none tracking-tight text-slate-950">
                    {value}
                  </p>
                </div>

                <div
                  className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tone}`}
                >
                  <Icon className="size-5" />
                </div>
              </div>

              <p className="mt-4 flex items-center gap-1 text-sm font-semibold text-slate-500">
                {note}

                <ArrowUpRight className="size-3 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </p>
            </Link>
          )
        )}
      </section>

      {/* Main Dashboard Content */}
      <section className="dashboard-main-grid">

        {/* Today's Appointments */}
        <article className="workspace-card min-w-0 self-start overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-bold text-slate-950">
                Today&apos;s appointments
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                {today.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>

            <Link
              href="/dashboard/calendar"
              className="shrink-0 text-xs font-bold text-indigo-600 hover:underline"
            >
              View calendar
            </Link>
          </div>

          {todayAppointments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CalendarDays className="mx-auto size-9 text-indigo-300" />

              <p className="mt-3 text-sm font-semibold text-slate-800">
                No appointments today
              </p>

              <Link
                href="/dashboard/appointments/new"
                className="mt-2 inline-block text-sm font-bold text-indigo-600 hover:underline"
              >
                Create one
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayAppointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/dashboard/appointments/${appointment.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition hover:bg-sky-50/70"
                >
                  <p className="w-12 text-xs font-bold text-slate-500">
                    {appointment.appointmentTime}
                  </p>

                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                    {initials(appointment.patientName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {appointment.patientName}
                    </p>

                    <p className="truncate text-xs text-slate-500">
                      {appointment.treatment}
                    </p>
                  </div>

                  <StatusBadge
                    status={appointment.status as AppointmentStatus}
                  />
                </Link>
              ))}
            </div>
          )}
        </article>

        {/* Dental Odontogram */}
        <div className="min-w-0 space-y-3">
          <DentalOdontogram />

          <Link
            href="/dashboard/clinical-workspace"
            className="flex items-center justify-center gap-1 text-sm font-bold text-[#6547E8] transition hover:gap-2"
          >
            Open clinical workspace
            <ChevronRight className="size-4" />
          </Link>
        </div>

        {/* Right Column */}
        <div className="min-w-0 space-y-5">

          {/* Patient Base */}
          <article className="workspace-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-950">
                  Patient base
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  Live patient records
                </p>
              </div>

              <Users className="size-5 text-sky-600" />
            </div>

            <div className="mt-5 flex items-center gap-4">
              <div className="grid size-24 place-items-center rounded-full border-[12px] border-emerald-400 border-b-violet-300 border-r-sky-300">
                <span className="text-lg font-bold text-slate-950">
                  {totalPatients}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <p>
                  <span className="mr-2 inline-block size-2 rounded-full bg-emerald-500" />
                  All patients: <b>{totalPatients}</b>
                </p>

                <p>
                  <span className="mr-2 inline-block size-2 rounded-full bg-sky-500" />
                  Added in 30d: <b>{newPatients}</b>
                </p>

                <Link
                  href="/dashboard/patients"
                  className="mt-3 inline-flex font-bold text-indigo-600 hover:underline"
                >
                  View all patients
                </Link>
              </div>
            </div>
          </article>

          {/* WhatsApp */}
          <article className="workspace-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-950">
                Recent WhatsApp
              </h2>

              <MessageCircle className="size-5 text-emerald-600" />
            </div>

            {recentConversations.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No WhatsApp conversations yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {recentConversations
                  .slice(0, 3)
                  .map((conversation) => (
                    <Link
                      key={conversation.id}
                      href="/dashboard/conversations"
                      className="flex items-center gap-3 rounded-xl p-1 transition hover:bg-emerald-50"
                    >
                      <div className="grid size-8 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                        {conversation.phone.slice(-2)}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {conversation.phone}
                        </p>

                        <p className="truncate text-xs text-slate-500">
                          {conversation.messages[0]?.content ||
                            "Open conversation"}
                        </p>
                      </div>
                    </Link>
                  ))}
              </div>
            )}

            <Link
              href="/dashboard/conversations"
              className="mt-4 inline-flex text-sm font-bold text-emerald-700 hover:underline"
            >
              Open WhatsApp conversations
            </Link>
          </article>
        </div>
      </section>

      {/* Recommended Actions */}
      <section className="workspace-card border-indigo-100 bg-gradient-to-r from-indigo-50 via-sky-50 to-violet-50 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-violet-600" />

          <h2 className="font-bold text-slate-950">
            Recommended clinic actions
          </h2>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/dashboard/appointments?status=Pending"
            className="rounded-2xl border border-white bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <Clock3 className="size-5 text-amber-600" />

            <p className="mt-3 font-bold text-slate-900">
              Pending confirmations
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {pendingAppointments.length} booking(s) need review.
            </p>
          </Link>

          <Link
            href="/dashboard/follow-ups"
            className="rounded-2xl border border-white bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <MessageCircle className="size-5 text-sky-600" />

            <p className="mt-3 font-bold text-slate-900">
              Follow-up queue
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Reconnect with patients and leads.
            </p>
          </Link>

          <Link
            href="/dashboard/treatment-plans"
            className="rounded-2xl border border-white bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <CheckCircle2 className="size-5 text-emerald-600" />

            <p className="mt-3 font-bold text-slate-900">
              Treatment plans
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Review proposed care plans.
            </p>
          </Link>

          <Link
            href="/dashboard/ai-coach"
            className="rounded-2xl border border-white bg-white/80 p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            <BotMessageSquare className="size-5 text-violet-600" />

            <p className="mt-3 font-bold text-slate-900">
              AI Coach
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Prepare consistent patient replies.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
