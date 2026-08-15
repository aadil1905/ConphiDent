export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePermission, can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, overdueBy, rupees } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/visit-status";
import PrintButton from "@/components/dashboard/PrintButton";
import HuddleCalls, { type HuddleCall, type TeamMember } from "@/components/today/HuddleCalls";
import ShareBriefButton from "@/components/today/ShareBriefButton";

const DAY = 24 * 60 * 60 * 1000;

type Risk = {
  key: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-control border border-border px-3.5 py-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">{label}</p>
      <p className="text-[22px] leading-tight font-bold tabular-nums text-heading">{value}</p>
      <p className="text-xs text-text-muted">{note}</p>
    </div>
  );
}

export default async function HuddleBriefPage() {
  const user = await requirePermission("manageSchedule");
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + DAY);

  const [visits, callbacks, team, lowStock] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        archivedAt: null,
        appointmentDate: { gte: startOfDay, lt: endOfDay },
        status: { not: "Cancelled" },
      },
      orderBy: [{ appointmentTime: "asc" }, { id: "asc" }],
      select: {
        id: true,
        appointmentTime: true,
        appointmentDate: true,
        patientName: true,
        patientId: true,
        treatment: true,
        status: true,
        provider: { select: { name: true } },
        chair: { select: { id: true, name: true } },
        patient: {
          select: {
            medicalNotes: true,
            invoices: {
              where: { voidedAt: null, status: { not: "Paid" } },
              select: {
                totalAmount: true,
                createdAt: true,
                payments: {
                  where: { status: "POSTED", reversedAt: null },
                  select: { amount: true },
                },
              },
            },
          },
        },
        labCases: {
          where: { cancelledAt: null, status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] } },
          select: { id: true, dueDate: true, labName: true, caseType: true },
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
      take: 12,
      select: {
        id: true,
        patientName: true,
        phone: true,
        message: true,
        scheduledFor: true,
        assignedUserId: true,
      },
    }),
    prisma.user.findMany({
      where: { clinicId: user.clinicId, active: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    can(user.role, "manageInventory")
      ? prisma.inventoryItem.findMany({
          where: { clinicId: user.clinicId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, quantity: true, reorderLevel: true, unit: true },
        })
      : [],
  ]);

  const runningLow = lowStock.filter((item) => item.quantity <= item.reorderLevel);

  const rows = visits.map((visit) => {
    const invoices = visit.patient?.invoices ?? [];
    const balance = invoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
      return sum + Math.max(0, invoice.totalAmount - paid);
    }, 0);
    const carried = invoices.reduce((sum, invoice) => {
      if (invoice.createdAt >= startOfDay) return sum;
      const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
      return sum + Math.max(0, invoice.totalAmount - paid);
    }, 0);
    const lateCase = visit.labCases.find((item) => item.dueDate && item.dueDate < now) ?? null;
    const flag = visit.patient?.medicalNotes?.trim() || null;
    const unconfirmed = visit.status === "Pending";
    return { visit, balance, carried, lateCase, flag, unconfirmed };
  });

  const unconfirmedCount = rows.filter((row) => row.unconfirmed).length;
  const chairsInUse = new Set(visits.map((visit) => visit.chair?.id).filter(Boolean)).size;
  const providers = new Set(visits.map((visit) => visit.provider?.name).filter(Boolean)).size;
  const expected = rows.reduce((sum, row) => sum + row.balance, 0);
  const carriedOver = rows.reduce((sum, row) => sum + row.carried, 0);
  const overdueCalls = callbacks.filter((task) => task.scheduledFor < startOfDay).length;

  const risks: Risk[] = [];
  for (const row of rows) {
    if (!row.lateCase) continue;
    const late = row.lateCase.dueDate ? overdueBy(row.lateCase.dueDate, now) : null;
    risks.push({
      key: `lab-${row.lateCase.id}`,
      title: `${row.visit.patientName.split(" ")[0]}'s ${row.lateCase.caseType} is still at the lab`,
      detail: `They sit at ${row.visit.appointmentTime || clockTime(row.visit.appointmentDate)}. ${
        row.lateCase.labName
      } is ${late ?? "due today"} — ring the lab before 9:30, or move them to another day.`,
      actionLabel: "Open the case",
      href: `/dashboard/laboratory/${row.lateCase.id}`,
    });
  }
  for (const row of rows) {
    if (!row.unconfirmed) continue;
    risks.push({
      key: `visit-${row.visit.id}`,
      title: `${row.visit.patientName} hasn't confirmed ${
        row.visit.appointmentTime || clockTime(row.visit.appointmentDate)
      }`,
      detail: `${row.visit.treatment}. If they drop out that is an empty chair — send a reminder from the visit.`,
      actionLabel: "Open the visit",
      href: `/dashboard/appointments/${row.visit.id}`,
    });
  }
  for (const item of runningLow) {
    risks.push({
      key: `stock-${item.id}`,
      title: `${item.name} is down to ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`,
      detail: `You reorder at ${item.reorderLevel}. Put the order in before the first extraction.`,
      actionLabel: "Order now",
      href: "/dashboard/operations",
    });
  }

  const calls: HuddleCall[] = callbacks.map((task) => ({
    id: task.id,
    who: task.patientName,
    why: task.message,
    due: overdueBy(task.scheduledFor, now) ?? "today",
    exact: exactStamp(task.scheduledFor),
    late: task.scheduledFor < startOfDay,
    assignedUserId: task.assignedUserId,
  }));

  const teamMembers: TeamMember[] = team.map((member) => ({ id: member.id, name: member.fullName }));

  const today = now.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const briefText = [
    `${user.clinic.brandName || user.clinic.name} — morning brief, ${today}`,
    "",
    `Booked today: ${visits.length}${unconfirmedCount ? ` (${unconfirmedCount} not confirmed)` : ""}`,
    `Calls to make: ${calls.length}${overdueCalls ? ` (${overdueCalls} overdue)` : ""}`,
    `Money still with patients coming in today: ${rupees(expected)}`,
    "",
    risks.length ? "Could break today:" : "Nothing looks likely to break today.",
    ...risks.map((risk) => `· ${risk.title} — ${risk.detail}`),
    "",
    "Who is coming:",
    ...rows.map(
      (row) =>
        `· ${row.visit.appointmentTime || clockTime(row.visit.appointmentDate)} ${
          row.visit.patientName
        } — ${row.visit.treatment}${row.balance > 0 ? ` (${rupees(row.balance)} owing)` : ""}`,
    ),
  ].join("\n");

  return (
    <div className="mx-auto flex w-full max-w-[62rem] flex-col gap-5 print:max-w-none print:gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <Link href="/dashboard" className="text-xs font-semibold text-primary hover:underline">
            ← Today
          </Link>
          <p className="text-[15px] font-semibold text-heading">Morning brief</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton label="Print for the notice board" tone="outline" />
          <ShareBriefButton text={briefText} />
        </div>
      </header>

      <section className="break-inside-avoid rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)] print:shadow-none">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-bold text-heading">{today}</h1>
            <p className="mt-1 text-[13px] text-text-muted">
              {risks.length === 0
                ? "Read this out before the first patient sits down. Nothing looks likely to break today."
                : `Read this out before the first patient sits down. ${risks.length} ${
                    risks.length === 1 ? "thing" : "things"
                  } could go wrong today — ${risks.length === 1 ? "it is" : "they are"} in the next box.`}
            </p>
          </div>
          <p title={exactStamp(now)} className="text-xs text-text-muted">
            Prepared {clockTime(now)} · {user.fullName}
          </p>
        </div>

        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
          <StatTile
            label="Booked today"
            value={String(visits.length)}
            note={unconfirmedCount ? `${unconfirmedCount} not confirmed` : "all confirmed"}
          />
          <StatTile
            label="Chairs in use"
            value={String(chairsInUse)}
            note={`${providers} ${providers === 1 ? "dentist" : "dentists"} on the floor`}
          />
          <StatTile
            label="Money due in"
            value={rupees(expected)}
            note={carriedOver > 0 ? `${rupees(carriedOver)} of it from before today` : "nothing carried over"}
          />
          <StatTile
            label="Calls to make"
            value={String(calls.length)}
            note={overdueCalls ? `${overdueCalls} already late` : "none overdue"}
          />
        </div>
      </section>

      {risks.length > 0 && (
        <section className="break-inside-avoid overflow-hidden rounded-card border border-danger-border bg-card shadow-[var(--shadow)] print:shadow-none">
          <div className="px-4.5 pt-4 pb-2.5">
            <h2 className="text-base font-semibold text-danger">Could break today</h2>
            <p className="mt-1 text-[13px] text-text-muted">
              Say who owns each one before the first patient sits down.
            </p>
          </div>
          {risks.map((risk) => (
            <div
              key={risk.key}
              className="grid items-center gap-3 border-t border-border border-l-[3px] border-l-danger-mark px-4.5 py-3 sm:grid-cols-[minmax(0,1fr)_150px]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{risk.title}</p>
                <p className="text-[13px] text-text-muted">{risk.detail}</p>
              </div>
              <Link
                href={risk.href}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-primary-hover print:hidden"
              >
                {risk.actionLabel}
              </Link>
            </div>
          ))}
        </section>
      )}

      <section className="break-inside-avoid overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)] print:shadow-none">
        <div className="px-4.5 pt-4 pb-2.5">
          <h2 className="text-base font-semibold text-heading">Who is coming, and what they need</h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {visits.length} booked
            {unconfirmedCount ? ` · ${unconfirmedCount} not confirmed` : ""}
            {rows.some((row) => row.flag || row.lateCase) ? " · flagged patients marked" : ""}
          </p>
        </div>

        {visits.length === 0 ? (
          <p className="px-4.5 pb-5 text-[13px] text-text-muted">
            Nothing booked today. A good morning to ring the people waiting on a call back.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-muted text-left">
                  {["Time", "Patient", "What we are doing", "Chair", "Balance"].map((head, index) => (
                    <th
                      key={head}
                      scope="col"
                      className={`border-y border-border px-4.5 py-2.5 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-text-muted uppercase ${
                        index === 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.visit.id}
                    className={`border-b border-border/70 last:border-b-0 ${
                      row.lateCase || row.flag ? "border-l-[3px] border-l-danger-mark" : ""
                    }`}
                  >
                    <td className="px-4.5 py-2.5 align-top font-semibold tabular-nums whitespace-nowrap text-heading">
                      {row.visit.appointmentTime || clockTime(row.visit.appointmentDate)}
                    </td>
                    <td className="px-4.5 py-2.5 align-top">
                      <span className="block font-semibold text-foreground">{row.visit.patientName}</span>
                      {row.lateCase && (
                        <span className="block text-[11px] font-semibold text-danger">
                          {row.lateCase.caseType} still at {row.lateCase.labName}
                        </span>
                      )}
                      {row.flag && (
                        <span className="block text-[11px] font-semibold text-danger">
                          Read first: {row.flag}
                        </span>
                      )}
                      {row.unconfirmed && (
                        <span className="block text-[11px] font-semibold text-warning">
                          {STATUS_LABELS.Pending}
                        </span>
                      )}
                    </td>
                    <td className="px-4.5 py-2.5 align-top text-text-muted">{row.visit.treatment}</td>
                    <td className="px-4.5 py-2.5 align-top text-text-muted">
                      {[row.visit.chair?.name, row.visit.provider?.name].filter(Boolean).join(" · ") ||
                        "Not set"}
                    </td>
                    <td
                      className={`px-4.5 py-2.5 text-right align-top tabular-nums ${
                        row.balance > 0 ? "font-semibold text-danger" : "text-text-muted"
                      }`}
                    >
                      {row.balance > 0 ? rupees(row.balance) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <HuddleCalls calls={calls} team={teamMembers} />

      {runningLow.length > 0 && (
        <section className="break-inside-avoid rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)] print:shadow-none">
          <h2 className="mb-2 text-base font-semibold text-heading">
            Stock that will not last the day
          </h2>
          <div className="flex flex-col">
            {runningLow.map((item) => (
              <div
                key={item.id}
                className="grid items-center gap-3 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_160px]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-heading">{item.name}</p>
                  <p className="text-[13px] text-text-muted">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""} left · you reorder at {item.reorderLevel}
                  </p>
                </div>
                <Link
                  href="/dashboard/operations"
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted print:hidden"
                >
                  Order now
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-text-muted print:mt-4">
        Printed {exactStamp(now)}. The numbers come from the same place as Today and Insights.
      </p>
    </div>
  );
}
