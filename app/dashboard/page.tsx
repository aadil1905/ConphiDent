import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, humanTime, overdueBy, rupees } from "@/lib/format";
import { todayMetrics } from "@/lib/metrics";
import NeedsYouQueue, { type QueueItem } from "@/components/today/NeedsYouQueue";
import ChairList, { type ChairVisit } from "@/components/today/ChairList";
import GlanceStrip, { type GlanceTile } from "@/components/today/GlanceStrip";
import ModuleGrid, { type ModuleTile } from "@/components/today/ModuleGrid";
import { NAV_DESTINATIONS, NAV_SETTINGS, visibleHrefs } from "@/components/shell/nav-items";
import { getFeatureEntitlements } from "@/lib/features";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { moneyMetrics, rangeFor } from "@/lib/metrics";

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

  // Today at a glance reconstructs its sparklines from the last 7 real days —
  // never seeded or smoothed. glanceDays is that window, oldest to newest,
  // ending on today; dayIndex/countByDay/sumByDay below bucket raw rows into it.
  const glanceDays = Array.from({ length: 7 }, (_, index) => new Date(startOfDay.getTime() - (6 - index) * DAY));
  const glanceFrom = glanceDays[0];
  const weekAgoStart = new Date(startOfDay.getTime() - 7 * DAY);
  const weekAgoEnd = new Date(endOfDay.getTime() - 7 * DAY);

  const [
    metrics,
    visits,
    tasks,
    openTaskCount,
    lateLabCases,
    lowStock,
    thisWeekPayments,
    visitsLast7,
    lastWeekSameDayVisits,
    tasksCreatedLast7,
    overdueTaskCount,
    labDueLast7,
    features,
    patientCount,
    openConversationCount,
    plansAwaitingDecision,
    unmatchedImaging,
    unreviewedImaging,
  ] = await Promise.all([
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
      prisma.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          archivedAt: null,
          status: { not: "Cancelled" },
          appointmentDate: { gte: glanceFrom, lt: endOfDay },
        },
        select: { appointmentDate: true },
      }),
      prisma.appointment.count({
        where: {
          clinicId: user.clinicId,
          archivedAt: null,
          status: { not: "Cancelled" },
          appointmentDate: { gte: weekAgoStart, lt: weekAgoEnd },
        },
      }),
      prisma.followUpTask.findMany({
        where: { clinicId: user.clinicId, createdAt: { gte: glanceFrom, lt: endOfDay } },
        select: { createdAt: true },
      }),
      prisma.followUpTask.count({
        where: { clinicId: user.clinicId, status: { in: ["PENDING", "FAILED"] }, scheduledFor: { lt: now } },
      }),
      canSeeLab
        ? prisma.labCase.findMany({
            where: {
              clinicId: user.clinicId,
              cancelledAt: null,
              status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] },
              dueDate: { gte: glanceFrom, lt: endOfDay },
            },
            select: { dueDate: true },
          })
        : [],
      getFeatureEntitlements(user.clinicId),
      prisma.patient.count({ where: { clinicId: user.clinicId, archivedAt: null } }),
      can(user.role, "sendWhatsApp")
        ? prisma.whatsAppConversation.count({ where: { clinicId: user.clinicId, status: "OPEN" } })
        : 0,
      can(user.role, "viewClinical")
        ? prisma.treatmentPlan.count({
            where: { clinicId: user.clinicId, cancelledAt: null, status: "Proposed" },
          })
        : 0,
      can(user.role, "uploadImaging")
        ? prisma.imagingStudy.count({
            where: { clinicId: user.clinicId, matchStatus: "UNMATCHED", archivedAt: null, enteredInErrorAt: null },
          })
        : 0,
      can(user.role, "signImaging")
        ? prisma.imagingStudy.count({
            where: {
              clinicId: user.clinicId,
              matchStatus: "CONFIRMED",
              status: { not: "REVIEWED" },
              archivedAt: null,
              enteredInErrorAt: null,
            },
          })
        : 0,
    ]);

  // moneyMetrics' stillOwed/owedByPatients read every open invoice regardless
  // of the range passed in, so any range gives the correct all-time figure —
  // reusing it here is one query, not a second billing summary to keep honest.
  const money = canSeeMoney ? await moneyMetrics({ clinicId: user.clinicId }, rangeFor("month", now)) : null;

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

  // --- Today at a glance ----------------------------------------------------
  const dayIndex = (value: Date) => {
    const key = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    return glanceDays.findIndex((day) => day.getTime() === key);
  };
  const countByDay = (dates: Date[]) => {
    const bucket = Array(7).fill(0);
    for (const date of dates) {
      const index = dayIndex(date);
      if (index >= 0) bucket[index] += 1;
    }
    return bucket;
  };
  const sumByDay = (rows: { at: Date; amount: number }[]) => {
    const bucket = Array(7).fill(0);
    for (const row of rows) {
      const index = dayIndex(row.at);
      if (index >= 0) bucket[index] += row.amount;
    }
    return bucket;
  };
  const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  const flatSeries = (last: number) => Array(6).fill(last).concat(last);

  const glanceTiles: GlanceTile[] = [];

  if (canSeeMoney) {
    const collectedSeries = sumByDay(thisWeekPayments.map((p) => ({ at: p.paidAt, amount: p.amount })));
    const lastWeekToday = thisWeekPayments
      .filter((p) => p.paidAt >= weekAgoStart && p.paidAt < weekAgoEnd)
      .reduce((sum, p) => sum + p.amount, 0);
    const moneyDelta = lastWeekToday
      ? Math.round(((metrics.collectedToday - lastWeekToday) / lastWeekToday) * 100)
      : null;
    const billedShare = metrics.visitsToday
      ? clampPct((metrics.seenSoFar / metrics.visitsToday) * 100)
      : 0;
    glanceTiles.push({
      key: "collected",
      label: "Collected today",
      value: rupees(metrics.collectedToday),
      href: "/dashboard/billing",
      icon: "money",
      tone: "primary",
      delta: moneyDelta === null ? null : `${Math.abs(moneyDelta)}%`,
      deltaUp: (moneyDelta ?? 0) >= 0,
      deltaIsGood: (moneyDelta ?? 0) >= 0,
      compare: lastWeekToday
        ? `${rupees(lastWeekToday)} on this day last week`
        : "Nothing recorded on this day last week",
      series: collectedSeries.some((v) => v > 0) ? collectedSeries : flatSeries(metrics.collectedToday),
      footLabel: "Visits billed",
      footPct: billedShare,
    });
  }

  const chairsSeries = countByDay(visitsLast7.map((v) => v.appointmentDate));
  const chairsDelta = lastWeekSameDayVisits ? visits.length - lastWeekSameDayVisits : null;
  glanceTiles.push({
    key: "chairs",
    label: "In the chairs",
    value: String(visits.length),
    href: "/dashboard/appointments",
    icon: "chairs",
    tone: "primary",
    delta: chairsDelta === null ? null : String(Math.abs(chairsDelta)),
    deltaUp: (chairsDelta ?? 0) >= 0,
    deltaIsGood: (chairsDelta ?? 0) >= 0,
    compare: `${seenToday} seen · ${unconfirmedToday} not confirmed`,
    series: chairsSeries.some((v) => v > 0) ? chairsSeries : flatSeries(visits.length),
    footLabel: "Seen",
    footPct: visits.length ? clampPct((seenToday / visits.length) * 100) : 0,
  });

  const askedSeries = countByDay(tasksCreatedLast7.map((t) => t.createdAt));
  const askedToday = askedSeries[6];
  const priorAverage = askedSeries.slice(0, 6).reduce((sum, v) => sum + v, 0) / 6;
  const askedDelta = priorAverage > 0 ? Math.round(askedToday - priorAverage) : null;
  const oldestOpen = tasks[0];
  glanceTiles.push({
    key: "needs-you",
    label: "Needs you",
    value: String(openTaskCount),
    href: "/dashboard/growth?show=overdue",
    icon: "calls",
    tone: "danger",
    delta: askedDelta === null || askedDelta === 0 ? null : String(Math.abs(askedDelta)),
    deltaUp: (askedDelta ?? 0) >= 0,
    // More new asks in a day is not good news — it is the one tile where "up" reads red.
    deltaIsGood: (askedDelta ?? 0) < 0,
    compare:
      overdueTaskCount > 0
        ? `${overdueTaskCount} overdue${oldestOpen ? ` · oldest is ${overdueBy(oldestOpen.scheduledFor, now) ?? "due today"}` : ""}`
        : "Nothing overdue right now",
    series: askedSeries.some((v) => v > 0) ? askedSeries : flatSeries(openTaskCount),
    footLabel: "Overdue",
    footPct: openTaskCount ? clampPct((overdueTaskCount / openTaskCount) * 100) : 0,
  });

  if (risks.length > 0) {
    const riskSeries = countByDay(labDueLast7.map((c) => c.dueDate as Date));
    const urgentCount = risks.filter((risk) => risk.urgent).length;
    const labCount = risks.filter((risk) => risk.key.startsWith("lab-")).length;
    const stockCount = risks.length - labCount;
    glanceTiles.push({
      key: "risk",
      label: "Could break today",
      value: String(risks.length),
      href: "/dashboard/laboratory",
      icon: "risk",
      tone: "warning",
      delta: null,
      deltaUp: false,
      deltaIsGood: false,
      compare:
        labCount && stockCount
          ? `${labCount} lab case${labCount === 1 ? "" : "s"} · ${stockCount} stock item${stockCount === 1 ? "" : "s"}`
          : labCount
            ? `${labCount} lab case${labCount === 1 ? "" : "s"}`
            : `${stockCount} stock item${stockCount === 1 ? "" : "s"}`,
      series: riskSeries.some((v) => v > 0) ? riskSeries : flatSeries(risks.length),
      footLabel: "Urgent",
      footPct: clampPct((urgentCount / risks.length) * 100),
    });
  }

  // --- Everything in the clinic ---------------------------------------------
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((permission) => can(user.role, permission));
  const visible = new Set(visibleHrefs(features, permissions));
  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

  const moduleSub = (href: string): { sub: string; badge: string; tone: ModuleTile["tone"] } => {
    switch (href) {
      case "/dashboard/appointments":
        return unconfirmedToday > 0
          ? { sub: `${visits.length} today · ${unconfirmedToday} unconfirmed`, badge: String(unconfirmedToday), tone: "warn" }
          : { sub: `${visits.length} today, all confirmed`, badge: "", tone: "calm" };
      case "/dashboard/patients":
        return { sub: `${patientCount.toLocaleString("en-IN")} record${plural(patientCount, "", "s")}`, badge: "", tone: "calm" };
      case "/dashboard/clinical-workspace":
        return plansAwaitingDecision > 0
          ? { sub: `${plansAwaitingDecision} plan${plural(plansAwaitingDecision, "", "s")} awaiting a decision`, badge: String(plansAwaitingDecision), tone: "warn" }
          : { sub: "Nothing awaiting a decision", badge: "", tone: "calm" };
      case "/dashboard/billing":
        return money && money.stillOwed > 0
          ? { sub: `${rupees(money.stillOwed)} outstanding`, badge: String(money.owedByPatients), tone: "bad" }
          : { sub: "Nothing outstanding", badge: "", tone: "calm" };
      case "/dashboard/conversations":
        return openConversationCount > 0
          ? { sub: `${openConversationCount} thread${plural(openConversationCount, "", "s")} awaiting a reply`, badge: String(openConversationCount), tone: "warn" }
          : { sub: "Inbox is clear", badge: "", tone: "calm" };
      case "/dashboard/growth":
        return overdueTaskCount > 0
          ? { sub: `${openTaskCount} follow-up${plural(openTaskCount, "", "s")} · ${overdueTaskCount} overdue`, badge: String(openTaskCount), tone: "bad" }
          : openTaskCount > 0
            ? { sub: `${openTaskCount} follow-up${plural(openTaskCount, "", "s")}`, badge: String(openTaskCount), tone: "warn" }
            : { sub: "Nothing to call back", badge: "", tone: "calm" };
      case "/dashboard/laboratory":
        return lateLabCases.length > 0
          ? { sub: `${lateLabCases.length} case${plural(lateLabCases.length, "", "s")} running late`, badge: String(lateLabCases.length), tone: "bad" }
          : { sub: "Nothing running late", badge: "", tone: "calm" };
      case "/dashboard/imaging": {
        const imagingCount = unmatchedImaging + unreviewedImaging;
        return imagingCount > 0
          ? { sub: `${imagingCount} scan${plural(imagingCount, "", "s")} need${plural(imagingCount, "s", "")} attention`, badge: String(imagingCount), tone: "warn" }
          : { sub: "Nothing waiting on you", badge: "", tone: "calm" };
      }
      case "/dashboard/operations": {
        const lowStockCount = lowStock.filter((item) => item.quantity <= item.reorderLevel).length;
        return lowStockCount > 0
          ? { sub: `${lowStockCount} item${plural(lowStockCount, "", "s")} below reorder level`, badge: String(lowStockCount), tone: "warn" }
          : { sub: "Stock levels are healthy", badge: "", tone: "calm" };
      }
      case "/dashboard/insights":
        return { sub: "Trends across the practice", badge: "", tone: "calm" };
      case "/dashboard/settings":
        return { sub: "Clinic, team and billing setup", badge: "", tone: "calm" };
      default:
        return { sub: "", badge: "", tone: "calm" };
    }
  };

  const modules: ModuleTile[] = [...NAV_DESTINATIONS.filter((item) => item.href !== "/dashboard"), NAV_SETTINGS]
    .filter((item) => visible.has(item.href))
    .map((item) => {
      const { sub, badge, tone } = moduleSub(item.href);
      return { key: item.href, label: item.label, sub, badge, tone, href: item.href, icon: item.icon };
    });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading">Today</h1>
          <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
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

      <GlanceStrip tiles={glanceTiles} />

      <ModuleGrid modules={modules} />

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
          className="rounded-card border border-border bg-card px-5.5 pt-4 pb-4.5 shadow-[var(--shadow)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="collected" className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
              Collected this week
            </h2>
            <span className="text-xs text-text-muted">vs last week</span>
          </div>
          <div className="mt-1.5 mb-3.5 flex flex-wrap items-baseline gap-3">
            <span className="text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums text-heading">
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
          <div className="px-5.5 pt-4 pb-3">
            <h2 id="risks" className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
              Could break today
            </h2>
            <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              Lab work and stock that a patient in the chair depends on.
            </p>
          </div>
          {risks.map((risk) => (
            <div
              key={risk.key}
              className={`grid grid-cols-1 items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_156px] ${
                risk.urgent ? "border-l-[3px] border-l-danger-mark" : "border-l-[3px] border-l-warning"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{risk.title}</p>
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{risk.detail}</p>
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
