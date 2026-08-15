import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * The only place a clinic KPI is worked out. Today, Insights, Money and Growth
 * all read from here, so the same question never gets two answers.
 *
 * Every figure below carries the sentence that explains it, because a number
 * on its own is the thing people argue about.
 */

export const APPOINTMENT_DONE = "Completed";
export const APPOINTMENT_CANCELLED = "Cancelled";
export const APPOINTMENT_NO_SHOW = "No-show";
export const LEAD_TREATED = "CONVERTED";
export const LEAD_BOOKED = "BOOKED";
export const LEAD_CONTACTED = "CONTACTED";
export const LEAD_LOST = "LOST";

export type Range = { from: Date; to: Date; label: string };

export type RangeKey = "month" | "quarter" | "year";

export function rangeFor(key: RangeKey, now: Date = new Date()): Range {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === "quarter") {
    return { from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to, label: "Last 3 months" };
  }
  if (key === "year") {
    return { from: new Date(now.getFullYear(), 0, 1), to, label: "This year" };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to, label: "This month" };
}

/** The same span, one period earlier — what "up 9% on last month" compares against. */
export function previousRange(range: Range): Range {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime()),
    label: `the ${range.label.toLowerCase()} before`,
  };
}

export type MoneyMetrics = {
  /** Money actually in the bank in this range. */
  collected: number;
  /** Work billed in this range, paid or not. */
  treated: number;
  /** Still owed across every open invoice, whenever it was raised. */
  stillOwed: number;
  owedByPatients: number;
  averageBill: number;
  patientsBilled: number;
  ageing: Array<{ label: string; count: number; amount: number; tone: "normal" | "warning" | "danger" }>;
  procedures: Array<{ name: string; count: number; amount: number }>;
  weekly: Array<{ label: string; treated: number; collected: number }>;
};

export type ChairMetrics = {
  patientsSeen: number;
  newPatients: number;
  workingDays: number;
  booked: number;
  completed: number;
  noShows: number;
  cancelled: number;
  /** Share of booked visits that nobody turned up for. */
  noShowRate: number;
  byWeekday: Array<{ label: string; booked: number; completed: number }>;
};

export type GrowthMetrics = {
  gotInTouch: number;
  reached: number;
  bookedAVisit: number;
  treated: number;
  /** treated ÷ gotInTouch. The one conversion figure in the product. */
  conversion: number;
  /** "31 of 68 were treated" — always shown next to the percentage. */
  conversionSentence: string;
  sources: Array<{ label: string; enquiries: number; treated: number; worth: number }>;
  lossReasons: Array<{ label: string; count: number }>;
  worthOfNewPatients: number;
};

type Scope = { clinicId: number };

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function percent(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/** Positive when things improved; null when there is nothing to compare to. */
export function changeAgainst(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function moneyMetrics({ clinicId }: Scope, range: Range): Promise<MoneyMetrics> {
  const [payments, invoices, openInvoices] = await Promise.all([
    prisma.payment.findMany({
      where: {
        clinicId,
        status: "POSTED",
        reversedAt: null,
        paidAt: { gte: range.from, lt: range.to },
      },
      select: { amount: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: { clinicId, voidedAt: null, issueDate: { gte: range.from, lt: range.to } },
      select: {
        totalAmount: true,
        issueDate: true,
        patientId: true,
        lineItems: { select: { description: true, quantity: true, lineTotal: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { clinicId, voidedAt: null },
      select: {
        totalAmount: true,
        issueDate: true,
        patientId: true,
        payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
      },
    }),
  ]);

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const treated = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const patientsBilled = new Set(invoices.map((invoice) => invoice.patientId)).size;

  const now = new Date();
  const buckets = [
    { label: "Less than 15 days", limit: 15, tone: "normal" as const, count: 0, amount: 0 },
    { label: "15 to 30 days", limit: 30, tone: "normal" as const, count: 0, amount: 0 },
    { label: "30 to 60 days", limit: 60, tone: "warning" as const, count: 0, amount: 0 },
    { label: "More than 60 days", limit: Infinity, tone: "danger" as const, count: 0, amount: 0 },
  ];

  let stillOwed = 0;
  const owingPatients = new Set<number>();
  for (const invoice of openInvoices) {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const due = invoice.totalAmount - paid;
    if (due <= 0) continue;
    stillOwed += due;
    owingPatients.add(invoice.patientId);
    const ageDays = Math.floor((now.getTime() - invoice.issueDate.getTime()) / DAY);
    const bucket = buckets.find((candidate) => ageDays < candidate.limit) ?? buckets[buckets.length - 1];
    bucket.count += 1;
    bucket.amount += due;
  }

  const byProcedure = new Map<string, { count: number; amount: number }>();
  for (const invoice of invoices) {
    for (const line of invoice.lineItems) {
      const name = line.description.trim() || "Other treatment";
      const running = byProcedure.get(name) ?? { count: 0, amount: 0 };
      running.count += line.quantity;
      running.amount += line.lineTotal;
      byProcedure.set(name, running);
    }
  }

  const weeks = new Map<number, { label: string; treated: number; collected: number }>();
  const weekStart = (value: Date) => {
    const start = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
  };
  const touchWeek = (value: Date) => {
    const start = weekStart(value);
    const key = start.getTime();
    if (!weeks.has(key)) {
      weeks.set(key, {
        label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        treated: 0,
        collected: 0,
      });
    }
    return weeks.get(key)!;
  };
  for (const invoice of invoices) touchWeek(invoice.issueDate).treated += invoice.totalAmount;
  for (const payment of payments) touchWeek(payment.paidAt).collected += payment.amount;

  return {
    collected,
    treated,
    stillOwed,
    owedByPatients: owingPatients.size,
    averageBill: patientsBilled ? Math.round(treated / patientsBilled) : 0,
    patientsBilled,
    ageing: buckets.map(({ label, tone, count, amount }) => ({ label, tone, count, amount })),
    procedures: [...byProcedure.entries()]
      .map(([name, running]) => ({ name, ...running }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    weekly: [...weeks.entries()].sort(([a], [b]) => a - b).map(([, week]) => week),
  };
}

export async function chairMetrics({ clinicId }: Scope, range: Range): Promise<ChairMetrics> {
  const [appointments, newPatients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId,
        archivedAt: null,
        appointmentDate: { gte: range.from, lt: range.to },
      },
      select: { status: true, appointmentDate: true, patientId: true },
    }),
    prisma.patient.count({
      where: { clinicId, archivedAt: null, createdAt: { gte: range.from, lt: range.to } },
    }),
  ]);

  const completed = appointments.filter((visit) => visit.status === APPOINTMENT_DONE);
  const noShows = appointments.filter((visit) => visit.status === APPOINTMENT_NO_SHOW).length;
  const cancelled = appointments.filter((visit) => visit.status === APPOINTMENT_CANCELLED).length;
  const turnedUpOrNot = completed.length + noShows;

  const byWeekday = WEEKDAYS.map((label) => ({ label, booked: 0, completed: 0 }));
  const workingDays = new Set<string>();
  for (const visit of appointments) {
    const day = byWeekday[visit.appointmentDate.getDay()];
    day.booked += 1;
    if (visit.status === APPOINTMENT_DONE) {
      day.completed += 1;
      workingDays.add(visit.appointmentDate.toDateString());
    }
  }

  return {
    patientsSeen: new Set(completed.map((visit) => visit.patientId).filter(Boolean)).size || completed.length,
    newPatients,
    workingDays: workingDays.size,
    booked: appointments.length,
    completed: completed.length,
    noShows,
    cancelled,
    noShowRate: percent(noShows, turnedUpOrNot),
    // Monday first reads better than the JS week.
    byWeekday: [...byWeekday.slice(1), byWeekday[0]],
  };
}

export async function growthMetrics({ clinicId }: Scope, range: Range): Promise<GrowthMetrics> {
  const leads = await prisma.lead.findMany({
    where: { clinicId, createdAt: { gte: range.from, lt: range.to } },
    select: {
      stage: true,
      source: true,
      lossReason: true,
      conversionValue: true,
      lastContactedAt: true,
      bookedAppointmentId: true,
    },
  });

  const gotInTouch = leads.length;
  const reached = leads.filter(
    (lead) => Boolean(lead.lastContactedAt) || [LEAD_CONTACTED, LEAD_BOOKED, LEAD_TREATED].includes(lead.stage),
  ).length;
  const bookedAVisit = leads.filter(
    (lead) => Boolean(lead.bookedAppointmentId) || [LEAD_BOOKED, LEAD_TREATED].includes(lead.stage),
  ).length;
  const treatedLeads = leads.filter((lead) => lead.stage === LEAD_TREATED);
  const treated = treatedLeads.length;

  const bySource = new Map<string, { enquiries: number; treated: number; worth: number }>();
  for (const lead of leads) {
    const label = lead.source?.trim() || "Not recorded";
    const running = bySource.get(label) ?? { enquiries: 0, treated: 0, worth: 0 };
    running.enquiries += 1;
    if (lead.stage === LEAD_TREATED) {
      running.treated += 1;
      running.worth += lead.conversionValue ?? 0;
    }
    bySource.set(label, running);
  }

  const byReason = new Map<string, number>();
  for (const lead of leads) {
    if (lead.stage !== LEAD_LOST) continue;
    const label = lead.lossReason?.trim() || "No reason picked";
    byReason.set(label, (byReason.get(label) ?? 0) + 1);
  }

  return {
    gotInTouch,
    reached,
    bookedAVisit,
    treated,
    conversion: percent(treated, gotInTouch),
    conversionSentence: gotInTouch
      ? `${treated} of ${gotInTouch} were treated`
      : "nobody has got in touch yet",
    sources: [...bySource.entries()]
      .map(([label, running]) => ({ label, ...running }))
      .sort((a, b) => b.treated - a.treated || b.enquiries - a.enquiries),
    lossReasons: [...byReason.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    worthOfNewPatients: treatedLeads.reduce((sum, lead) => sum + (lead.conversionValue ?? 0), 0),
  };
}

export type TodayMetrics = {
  visitsToday: number;
  stillToCome: number;
  seenSoFar: number;
  collectedToday: number;
  toCallBack: number;
  lateLabCases: number;
};

/** The handful of numbers the Today screen leads with. */
export async function todayMetrics({ clinicId }: Scope, now: Date = new Date()): Promise<TodayMetrics> {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + DAY);

  const [visits, payments, toCallBack, lateLabCases] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId,
        archivedAt: null,
        appointmentDate: { gte: startOfDay, lt: endOfDay },
        status: { not: APPOINTMENT_CANCELLED },
      },
      select: { status: true },
    }),
    prisma.payment.aggregate({
      where: {
        clinicId,
        status: "POSTED",
        reversedAt: null,
        paidAt: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { amount: true },
    }),
    prisma.followUpTask.count({
      where: { clinicId, status: { in: ["PENDING", "FAILED"] }, scheduledFor: { lte: now } },
    }),
    prisma.labCase.count({
      where: {
        clinicId,
        dueDate: { lt: now },
        status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] },
      },
    }),
  ]);

  const seenSoFar = visits.filter((visit) => visit.status === APPOINTMENT_DONE).length;

  return {
    visitsToday: visits.length,
    seenSoFar,
    stillToCome: visits.length - seenSoFar,
    collectedToday: payments._sum.amount ?? 0,
    toCallBack,
    lateLabCases,
  };
}
