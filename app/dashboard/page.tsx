import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, humanTime, overdueBy, rupees } from "@/lib/format";
import { todayMetrics } from "@/lib/metrics";
import NeedsYouQueue, { type QueueItem } from "@/components/today/NeedsYouQueue";
import ChairList, { type ChairVisit } from "@/components/today/ChairList";

export const dynamic = "force-dynamic";

const QUEUE_SHOWN = 5;
const CHAIRS_SHOWN = 7;
const DAY = 24 * 60 * 60 * 1000;

/** Parses "09:45 am" / "14:30" onto today, so relative times are honest. */
function visitMoment(date: Date, time: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time.trim());
  const when = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!match) return when;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  when.setHours(hour, minute, 0, 0);
  return when;
}

export default async function TodayPage() {
  const user = await requireUser();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + DAY);
  const startOfWeek = new Date(startOfDay.getTime() - startOfDay.getDay() * DAY);
  const startOfLastWeek = new Date(startOfWeek.getTime() - 7 * DAY);

  const canSeeMoney = can(user.role, "manageBilling");
  const canSeeLab = can(user.role, "manageLaboratory");
  const canSeeStock = can(user.role, "manageInventory");

  const [metrics, visits, tasks, openTaskCount, lateLabCases, lowStock, thisWeekPayments] =
    await Promise.all([
      todayMetrics({ clinicId: user.clinicId }, now),
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          archivedAt: null,
          appointmentDate: { gte: startOfDay, lt: endOfDay },
          status: { not: "Cancelled" },
        },
        orderBy: { appointmentTime: "asc" },
        select: {
          id: true,
          appointmentDate: true,
          appointmentTime: true,
          patientName: true,
          patientId: true,
          treatment: true,
          status: true,
          labCases: {
            where: { cancelledAt: null, status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] } },
            select: { dueDate: true, labName: true },
          },
        },
      }),
      prisma.followUpTask.findMany({
        where: {
          clinicId: user.clinicId,
          status: { in: ["PENDING", "FAILED"] },
          scheduledFor: { lte: endOfDay },
        },
        orderBy: { scheduledFor: "asc" },
        take: QUEUE_SHOWN,
        select: {
          id: true,
          patientName: true,
          phone: true,
          message: true,
          taskType: true,
          scheduledFor: true,
          patientId: true,
          leadId: true,
        },
      }),
      prisma.followUpTask.count({
        where: { clinicId: user.clinicId, status: { in: ["PENDING", "FAILED"] } },
      }),
      canSeeLab
        ? prisma.labCase.findMany({
            where: {
              clinicId: user.clinicId,
              cancelledAt: null,
              status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] },
              dueDate: { lt: endOfDay },
            },
            orderBy: { dueDate: "asc" },
            take: 4,
            select: {
              id: true,
              caseType: true,
              labName: true,
              dueDate: true,
              patient: { select: { fullName: true } },
            },
          })
        : [],
      canSeeStock
        ? prisma.inventoryItem.findMany({
            where: { clinicId: user.clinicId, active: true },
            select: { id: true, name: true, quantity: true, reorderLevel: true, unit: true },
          })
        : [],
      canSeeMoney
        ? prisma.payment.findMany({
            where: {
              clinicId: user.clinicId,
              status: "POSTED",
              reversedAt: null,
              paidAt: { gte: startOfLastWeek, lt: endOfDay },
            },
            select: { amount: true, paidAt: true },
          })
        : [],
    ]);

  // --- Needs you today -----------------------------------------------------
  const queue: QueueItem[] = tasks.map((task) => {
    const late = overdueBy(task.scheduledFor, now);
    return {
      taskId: task.id,
      who: task.patientName,
      what: task.message,
      due: late ?? humanTime(task.scheduledFor, now),
      exact: exactStamp(task.scheduledFor),
      overdue: Boolean(late),
      primaryLabel: `Call ${task.patientName.split(" ")[0]}`,
      primaryHref: null,
      secondaryLabel: "Open",
      secondaryHref: task.patientId
        ? `/dashboard/patients/${task.patientId}`
        : // No enquiry detail page exists, so land on the queue with them found.
          `/dashboard/growth?show=everyone&q=${encodeURIComponent(task.phone)}`,
    };
  });
  const overdueInQueue = queue.filter((item) => item.overdue).length;

  // --- Today in the chairs -------------------------------------------------
  const chairs: ChairVisit[] = visits.slice(0, CHAIRS_SHOWN).map((visit) => {
    const moment = visitMoment(visit.appointmentDate, visit.appointmentTime);
    const lateCase = visit.labCases.find((item) => item.dueDate && item.dueDate < now);
    const state: ChairVisit["state"] =
      visit.status === "Completed"
        ? "seen"
        : lateCase
          ? "waiting"
          : visit.status === "Confirmed"
            ? "confirmed"
            : "unconfirmed";

    return {
      id: visit.id,
      time: visit.appointmentTime || clockTime(moment),
      patientName: visit.patientName,
      patientHref: visit.patientId ? `/dashboard/patients/${visit.patientId}` : null,
      reason: visit.treatment,
      relative: humanTime(moment, now),
      exact: exactStamp(moment),
      state,
      blocker: lateCase ? `${lateCase.labName} is running late` : null,
    };
  });

  const seenToday = visits.filter((visit) => visit.status === "Completed").length;
  const unconfirmedToday = visits.filter(
    (visit) => visit.status !== "Completed" && visit.status !== "Confirmed",
  ).length;

  // --- Collected this week -------------------------------------------------
  const weekBars = Array.from({ length: 6 }, (_, index) => {
    const dayStart = new Date(startOfWeek.getTime() + (index + 1) * DAY);
    const dayEnd = new Date(dayStart.getTime() + DAY);
    const lastStart = new Date(dayStart.getTime() - 7 * DAY);
    const lastEnd = new Date(lastStart.getTime() + DAY);
    const sum = (from: Date, to: Date) =>
      thisWeekPayments
        .filter((payment) => payment.paidAt >= from && payment.paidAt < to)
        .reduce((total, payment) => total + payment.amount, 0);
    return {
      day: dayStart.toLocaleDateString("en-IN", { weekday: "short" }),
      now: sum(dayStart, dayEnd),
      prev: sum(lastStart, lastEnd),
    };
  });
  const collectedThisWeek = weekBars.reduce((sum, bar) => sum + bar.now, 0);
  const collectedLastWeek = weekBars.reduce((sum, bar) => sum + bar.prev, 0);
  const weekChange = collectedLastWeek
    ? Math.round(((collectedThisWeek - collectedLastWeek) / collectedLastWeek) * 100)
    : null;
  const barMax = Math.max(1, ...weekBars.flatMap((bar) => [bar.now, bar.prev]));

  // --- Could break today ---------------------------------------------------
  const risks = [
    ...lateLabCases.map((labCase) => ({
      key: `lab-${labCase.id}`,
      title: `${labCase.caseType} for ${labCase.patient.fullName.split(" ")[0]}${
        labCase.dueDate ? ` · ${overdueBy(labCase.dueDate, now) ?? "due today"}` : ""
      }`,
      detail: labCase.labName,
      urgent: Boolean(labCase.dueDate && labCase.dueDate < startOfDay),
      actionLabel: "Open case",
      href: `/dashboard/laboratory/${labCase.id}`,
    })),
    ...lowStock
      .filter((item) => item.quantity <= item.reorderLevel)
      .slice(0, 4)
      .map((item) => ({
        key: `stock-${item.id}`,
        title: `${item.name} down to ${item.quantity} ${item.unit ?? ""}`.trim(),
        detail: `Reorder level is ${item.reorderLevel}`,
        urgent: item.quantity <= 0,
        actionLabel: "Order now",
        href: "/dashboard/operations",
      })),
  ].slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold text-heading">Today</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {now.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        {can(user.role, "manageSchedule") && (
          <Link
            href="/dashboard/huddle"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Morning brief
          </Link>
        )}
      </header>

      <NeedsYouQueue
        items={queue}
        total={openTaskCount}
        overdueCount={overdueInQueue}
        moreHref="/dashboard/growth?show=overdue"
      />

      <ChairList
        visits={chairs}
        bookedToday={visits.length}
        seenToday={seenToday}
        unconfirmedToday={unconfirmedToday}
      />

      {canSeeMoney && (
        <section
          aria-labelledby="collected"
          className="rounded-card border border-border bg-card px-4.5 pt-4 pb-4.5 shadow-[var(--shadow)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="collected" className="text-base font-semibold text-heading">
              Collected this week
            </h2>
            <span className="text-xs text-text-muted">vs last week</span>
          </div>
          <div className="mt-1.5 mb-3.5 flex flex-wrap items-baseline gap-3">
            <span className="text-[26px] leading-none font-bold tabular-nums text-heading">
              {rupees(collectedThisWeek)}
            </span>
            {weekChange !== null && (
              <span
                className={`text-[13px] font-semibold ${weekChange >= 0 ? "text-success" : "text-danger"}`}
              >
                {weekChange >= 0 ? "+" : ""}
                {weekChange}% on last week
              </span>
            )}
            {metrics.collectedToday > 0 && (
              <span className="text-[13px] text-text-muted">
                {rupees(metrics.collectedToday)} of it came in today
              </span>
            )}
          </div>

          <div className="flex h-[132px] items-end gap-2.5">
            {weekBars.map((bar) => (
              <div key={bar.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-[104px] w-full items-end gap-[3px]">
                  <div
                    title={`Last week ${rupees(bar.prev)}`}
                    style={{ height: `${Math.round((bar.prev / barMax) * 100)}%` }}
                    className="flex-1 rounded-t-sm bg-secondary"
                  />
                  <div
                    title={`This week ${rupees(bar.now)}`}
                    style={{ height: `${Math.round((bar.now / barMax) * 100)}%` }}
                    className="flex-1 rounded-t-sm bg-primary"
                  />
                </div>
                <span className="text-[11px] text-text-muted">{bar.day}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-3.5 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-primary" aria-hidden />
              This week
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-secondary" aria-hidden />
              Last week
            </span>
            <span>Both from the shared metrics module</span>
          </div>
        </section>
      )}

      {risks.length > 0 && (
        <section
          aria-labelledby="risks"
          className="rounded-card border border-border bg-card shadow-[var(--shadow)]"
        >
          <div className="px-4.5 pt-4 pb-3">
            <h2 id="risks" className="text-base font-semibold text-heading">
              Could break today
            </h2>
            <p className="mt-1 text-[13px] text-text-muted">
              Lab work and stock that a patient in the chair depends on.
            </p>
          </div>
          {risks.map((risk) => (
            <div
              key={risk.key}
              className={`grid grid-cols-1 items-center gap-3 border-t border-border px-4.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_156px] ${
                risk.urgent ? "border-l-[3px] border-l-danger-mark" : "border-l-[3px] border-l-warning"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{risk.title}</p>
                <p className="text-[13px] text-text-muted">{risk.detail}</p>
              </div>
              <Link
                href={risk.href}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
              >
                {risk.actionLabel}
              </Link>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
