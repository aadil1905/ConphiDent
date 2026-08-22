import Link from "next/link";
import { Suspense } from "react";
import { CalendarX2, ChevronLeft, ChevronRight } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime } from "@/lib/format";
import { listHref, pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListLink, ListRow } from "@/components/lists/DataList";
import FilterChips from "@/components/lists/FilterChips";
import ListSearch from "@/components/lists/ListSearch";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";
import StatusSelect from "@/components/schedule/StatusSelect";
import DateJump from "@/components/schedule/DateJump";
import StatusBadge from "@/components/appointments/StatusBadge";
import type { AppointmentStatus } from "@/types/appointment";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/appointments";
const DAY = 24 * 60 * 60 * 1000;
/* The default working window. The grid extends itself around any visit that
   falls outside it — a 9-to-7 hardcode was quietly rendering an 8pm visit in
   no cell at all, which reads as "nothing booked". */
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19;

type View = "day" | "week" | "list";

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseAnchor(raw: string | undefined) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "09:45 am" or "14:30" onto a date, so relative times are honest. */
function visitMoment(date: Date, time: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time.trim());
  const when = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!match) return when;
  let hour = Number(match[1]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  when.setHours(hour, Number(match[2]), 0, 0);
  return when;
}

const LIST_COLUMNS = [
  { key: "when", label: "When", sortKey: "when" },
  { key: "patient", label: "Patient", sortKey: "patient" },
  { key: "phone", label: "Phone", secondary: true },
  { key: "reason", label: "Reason", secondary: true },
  { key: "status", label: "Status" },
  { key: "open", label: "", align: "right" as const },
];

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("manageSchedule");
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: "when",
    defaultDir: "asc",
    filterKeys: ["show", "view", "date"],
  });

  const rawView = query.filters.view;
  const view: View = rawView === "week" || rawView === "list" ? rawView : "day";
  const anchor = parseAnchor(query.filters.date);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const show = query.filters.show ?? "";

  // The window each view asks the database for.
  const weekStart = new Date(anchor.getTime() - ((anchor.getDay() + 6) % 7) * DAY);
  const from =
    view === "day" ? anchor : view === "week" ? weekStart : new Date(anchor.getTime() - DAY);
  const to =
    view === "day"
      ? new Date(anchor.getTime() + DAY)
      : view === "week"
        ? new Date(weekStart.getTime() + 7 * DAY)
        : new Date(anchor.getTime() + 2 * DAY);

  const search: Prisma.AppointmentWhereInput = query.q
    ? {
        OR: [
          { patientName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q.replace(/\D/g, "") || query.q } },
          { treatment: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const scoped: Prisma.AppointmentWhereInput = {
    clinicId: user.clinicId,
    archivedAt: null,
    appointmentDate: { gte: from, lt: to },
    ...search,
    ...(show === "unconfirmed" ? { status: "Pending" } : {}),
    ...(show === "chase" ? { status: { in: ["No-show", "Cancelled"] } } : {}),
    ...(show === "new" ? { patientId: null } : {}),
    ...(show === "due"
      ? { patient: { invoices: { some: { voidedAt: null, status: { not: "Paid" } } } } }
      : {}),
  };

  const total = await prisma.appointment.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const visits = await prisma.appointment.findMany({
    where: scoped,
    orderBy:
      query.sort === "patient"
        ? [{ patientName: query.dir }]
        : [{ appointmentDate: query.dir }, { appointmentTime: query.dir }],
    ...(view === "list" ? { skip, take } : {}),
    select: {
      id: true,
      appointmentDate: true,
      appointmentTime: true,
      patientName: true,
      patientId: true,
      phone: true,
      treatment: true,
      status: true,
      chair: { select: { name: true } },
      provider: { select: { name: true } },
    },
  });

  const rangeLabel =
    view === "week"
      ? `${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(
          weekStart.getTime() + 6 * DAY,
        ).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
      : view === "day"
        ? anchor.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : `${new Date(anchor.getTime() - DAY).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(
            anchor.getTime() + DAY,
          ).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const step = view === "week" ? 7 : 1;
  const shiftHref = (days: number) =>
    listHref(BASE, query, { date: isoDate(new Date(anchor.getTime() + days * DAY)), page: 1 });

  const seenCount = visits.filter((visit) => visit.status === "Completed").length;
  const unconfirmedCount = visits.filter((visit) => visit.status === "Pending").length;

  // The week grid's rows: the default working window, stretched to hold every
  // visit actually in it, so an early or evening booking always has a cell.
  const visitHours = visits.map((visit) => visitMoment(visit.appointmentDate, visit.appointmentTime).getHours());
  const firstHour = Math.min(DAY_START_HOUR, ...visitHours);
  const lastHour = Math.max(DAY_END_HOUR, ...visitHours);
  const weekHours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        sub={rangeLabel}
        actions={
          <Link
            href="/dashboard/appointments/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Book a visit
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* role="tab"/"tablist" promises arrow-key switching between panels;
            these are plain navigation links to a new URL, so aria-current is
            the correct role for "which one am I on", not aria-selected. */}
        <nav aria-label="Schedule view" className="flex gap-1 rounded-control border border-border bg-card p-1">
          {(["day", "week", "list"] as const).map((option) => (
            <Link
              key={option}
              href={listHref(BASE, query, { view: option, page: 1 })}
              aria-current={view === option ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-chip px-3.5 text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold ${
                view === option ? "bg-secondary text-heading" : "text-text-muted hover:bg-muted"
              }`}
            >
              {option === "day" ? "Day" : option === "week" ? "Week" : "List"}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={shiftHref(-step)}
            aria-label={view === "week" ? "Previous week" : "Previous day"}
            className="grid h-11 w-11 place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="min-w-[190px] text-center text-sm font-semibold tabular-nums text-heading">
            {rangeLabel}
          </span>
          <Link
            href={shiftHref(step)}
            aria-label={view === "week" ? "Next week" : "Next day"}
            className="grid h-11 w-11 place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={listHref(BASE, query, { date: isoDate(today), page: 1 })}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            Today
          </Link>
          <Suspense fallback={<div className="h-11 w-36 rounded-control bg-muted" />}>
            <DateJump key={isoDate(anchor)} value={isoDate(anchor)} />
          </Suspense>
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          {/* The q filter has been parsed and applied since this page was
              written — the control for it was never rendered, so "No visits
              match" was reachable only by hand-editing the URL. */}
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch
              placeholder="Name, phone or treatment — filters as you type"
              label="Search the schedule"
            />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the schedule"
            options={[
              { value: "unconfirmed", label: "Not confirmed" },
              { value: "chase", label: "Needs a call" },
              { value: "new", label: "New patients" },
              { value: "due", label: "Money due" },
            ]}
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      {view === "day" && (
        <section className="rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-3.5 pb-2.5">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The day, chair by chair</h2>
            <span className="text-xs text-text-muted">
              {total === 0
                ? "Nothing booked"
                : `Showing ${visits.length} of ${total} · ${seenCount} seen · ${unconfirmedCount} not confirmed`}
            </span>
          </div>

          {visits.length === 0 ? (
            <div className="border-t border-border">
              <EmptyState
                icon={CalendarX2}
                title={query.q ? `No visits match “${query.q}”` : "Nothing booked for this day"}
                body={
                  query.q
                    ? "Try a phone number, clear the filters, or book someone in."
                    : "A quiet day is a good day to ring the people waiting on a callback."
                }
                action={{ label: "Book a visit", href: "/dashboard/appointments/new" }}
              />
            </div>
          ) : (
            visits.map((visit) => {
              const moment = visitMoment(visit.appointmentDate, visit.appointmentTime);
              return (
                <div
                  key={visit.id}
                  className="grid grid-cols-1 items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)] lg:grid-cols-[84px_minmax(0,1fr)_150px_150px_120px]"
                >
                  {/* The time leads the row the receptionist scans down to find
                      "now" — the same size ChairList settled on for the same
                      column, for the reason documented there. */}
                  <div className="font-[family-name:var(--font-workspace-display)] text-[length:var(--text-section)] leading-none font-semibold tabular-nums text-heading">
                    {visit.appointmentTime}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      {visit.patientId ? (
                        <Link
                          href={`/dashboard/patients/${visit.patientId}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {visit.patientName}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-heading">{visit.patientName}</span>
                      )}
                      <span title={exactStamp(moment)} className="text-xs text-text-muted">
                        {humanTime(moment, now)}
                      </span>
                    </div>
                    <p className="truncate text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                      {visit.treatment} ·{" "}
                      <a
                        href={`tel:${visit.phone.replace(/[^+\d]/g, "")}`}
                        title={`Call ${visit.patientName}`}
                        className="tabular-nums underline-offset-2 hover:text-primary hover:underline"
                      >
                        {visit.phone}
                      </a>
                    </p>
                  </div>
                  <div className="text-[length:var(--text-secondary)] text-text-muted">
                    {visit.chair?.name || visit.provider?.name || "No chair set"}
                  </div>
                  <StatusSelect
                    appointmentId={visit.id}
                    status={visit.status}
                    patientName={visit.patientName}
                  />
                  <Link
                    href={`${BASE}/${visit.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                  >
                    Open
                  </Link>
                </div>
              );
            })
          )}
        </section>
      )}

      {view === "week" && (
        <section className="overflow-x-auto rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[84px_repeat(7,1fr)] border-b border-border bg-muted">
              <div className="p-2.5 text-[length:var(--text-micro)] leading-[var(--text-micro-lh)] font-semibold tracking-[0.14em] text-text-muted uppercase">
                Time
              </div>
              {Array.from({ length: 7 }, (_, index) => {
                const day = new Date(weekStart.getTime() + index * DAY);
                return (
                  <div key={index} className="border-l border-border p-2.5">
                    <div className="text-[length:var(--text-micro)] leading-[var(--text-micro-lh)] font-semibold tracking-[0.14em] text-text-muted uppercase">
                      {day.toLocaleDateString("en-IN", { weekday: "short" })}
                    </div>
                    <div className="text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold tabular-nums text-heading">
                      {day.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                );
              })}
            </div>

            {weekHours.map((hour) => (
              <div
                key={hour}
                className="grid min-h-14 grid-cols-[84px_repeat(7,1fr)] border-b border-border last:border-b-0"
              >
                <div className="px-2.5 py-2 text-xs tabular-nums text-text-muted">
                  {`${((hour + 11) % 12) + 1}:00 ${hour < 12 ? "am" : "pm"}`}
                </div>
                {Array.from({ length: 7 }, (_, index) => {
                  const day = new Date(weekStart.getTime() + index * DAY);
                  const inCell = visits.filter((visit) => {
                    const moment = visitMoment(visit.appointmentDate, visit.appointmentTime);
                    return (
                      moment.getDate() === day.getDate() &&
                      moment.getMonth() === day.getMonth() &&
                      moment.getHours() === hour
                    );
                  });
                  return (
                    <div key={index} className="flex flex-col gap-1 border-l border-border p-1.5">
                      {inCell.map((visit) => (
                        <Link
                          key={visit.id}
                          href={`${BASE}/${visit.id}`}
                          title={`${visit.appointmentTime} · ${visit.patientName} · ${visit.treatment}`}
                          // min-h-11: the empty-cell "+ book" link beside this
                          // already carries the 44px floor; a booked chip is
                          // the more-tapped of the two and was smaller.
                          className={`flex min-h-11 flex-col justify-center rounded-chip border-l-2 px-1.5 py-1 ${
                            visit.status === "Pending"
                              ? "border-l-warning bg-warning-bg"
                              : visit.status === "Completed"
                                ? "border-l-success bg-success-bg"
                                : "border-l-primary bg-secondary"
                          }`}
                        >
                          <span className="block truncate text-xs font-semibold text-heading">
                            {visit.patientName}
                          </span>
                          <span className="block truncate text-[length:var(--text-micro)] text-text-muted">
                            {visit.treatment}
                          </span>
                        </Link>
                      ))}
                      {inCell.length === 0 && (
                        <Link
                          href={`/dashboard/appointments/new?date=${isoDate(day)}&time=${String(hour).padStart(2, "0")}:00`}
                          aria-label={`Book ${day.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })} at ${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`}
                          className="flex min-h-11 flex-1 items-center rounded-chip px-1.5 text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold text-text-muted/70 hover:bg-primary-soft hover:text-primary"
                        >
                          + book
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "list" && (
        <DataList
          basePath={BASE}
          query={query}
          columns={LIST_COLUMNS}
          total={total}
          shown={visits.length}
          noun="visits"
          empty={
            <EmptyState
              icon={CalendarX2}
              title={query.q ? `No visits match “${query.q}”` : "Nothing in this window"}
              body={
                query.q
                  ? "Try a phone number, clear the filters, or book someone in."
                  : "Move the dates, or book the first visit for these days."
              }
              action={{ label: "Book a visit", href: "/dashboard/appointments/new" }}
            />
          }
        >
          {visits.map((visit) => {
            const moment = visitMoment(visit.appointmentDate, visit.appointmentTime);
            return (
              <ListRow key={visit.id} needsAttention={visit.status === "No-show"}>
                <ListCell primary>
                  <ListLink href={`${BASE}/${visit.id}`} className="tabular-nums text-foreground">
                    <span title={exactStamp(moment)}>
                      {moment.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ·{" "}
                      {visit.appointmentTime}
                    </span>
                  </ListLink>
                </ListCell>
                <ListCell interactive>
                  {visit.patientId ? (
                    <Link
                      href={`/dashboard/patients/${visit.patientId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {visit.patientName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{visit.patientName}</span>
                  )}
                </ListCell>
                <ListCell secondary interactive>
                  <a
                    href={`tel:${visit.phone.replace(/[^+\d]/g, "")}`}
                    title={`Call ${visit.patientName}`}
                    className="tabular-nums text-text-muted underline-offset-2 hover:text-primary hover:underline"
                  >
                    {visit.phone}
                  </a>
                </ListCell>
                <ListCell secondary>
                  <span className="text-text-muted">{visit.treatment}</span>
                </ListCell>
                <ListCell>
                  <StatusBadge status={visit.status as AppointmentStatus} />
                </ListCell>
                <ListCell align="right" interactive>
                  <Link
                    href={`${BASE}/${visit.id}`}
                    className="inline-flex min-h-11 items-center text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold text-primary"
                  >
                    Open
                  </Link>
                </ListCell>
              </ListRow>
            );
          })}
        </DataList>
      )}
    </div>
  );
}
