export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { can, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, overdueBy } from "@/lib/format";
import { growthMetrics, rangeFor } from "@/lib/metrics";
import { listHref, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import {
  CLOSE_OUTCOMES,
  QUEUE_FILTERS,
  bookingHref,
  loadGrowthQueue,
  parseQueueFilter,
} from "@/lib/growth-queue";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";
import GrowthQueue, { type QueueRow } from "@/components/growth/GrowthQueue";
import LogEnquiry from "@/components/growth/LogEnquiry";

const BASE = "/dashboard/growth";
const DEFAULT_WANTS = ["Check-up", "Pain", "Braces", "Implant", "Whitening"];

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("managePatients");
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: "due",
    defaultDir: "asc",
    filterKeys: ["show", "log", "invalid"],
  });
  const filter = parseQueueFilter(query.filters.show);
  // The chips and the paging links all carry the filter that is actually in
  // force, so a bare /dashboard/growth still highlights "Due today".
  const view = { ...query, filters: { ...query.filters, show: filter } };
  const href = (changes: Record<string, string | number>) =>
    listHref(BASE, view, { log: "", invalid: "", ...changes });

  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [queue, metrics, staff, services] = await Promise.all([
    loadGrowthQueue({
      clinicId: user.clinicId,
      userId: user.id,
      q: query.q,
      filter,
      now,
      page: query.page,
      size: query.size,
    }),
    growthMetrics({ clinicId: user.clinicId }, rangeFor("month", now)),
    prisma.user.findMany({
      where: { clinicId: user.clinicId, active: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.clinicService.findMany({
      where: { clinicId: user.clinicId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 6,
      select: { name: true },
    }),
  ]);

  // Whoever is looking is the most likely person to take the work, so they lead.
  const teammates = staff
    .filter((member) => can(member.role, "managePatients"))
    .map((member) => ({ id: member.id, name: member.fullName }))
    .sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0));

  const rows: QueueRow[] = queue.items.map((item) => {
    const late = item.due ? overdueBy(item.due, now) : null;
    const dueToday = Boolean(item.due && !late && item.due < endOfToday);
    return {
      key: item.key,
      name: item.name,
      phone: item.phone,
      origin: item.origin,
      why: item.why,
      stage: item.stage,
      ownerLabel: item.owner ? `With ${item.owner}` : "Nobody has taken this",
      dueLabel: late ?? (dueToday ? "due today" : item.due ? `due ${humanTime(item.due, now)}` : "no callback promised"),
      dueExact: item.due ? exactStamp(item.due) : "Nobody has set a date",
      tone: late ? "overdue" : dueToday ? "today" : "later",
      kindLabel: item.isPatient ? "Our patient" : "New enquiry",
      isPatient: item.isPatient,
      patientHref: item.patientId ? `/dashboard/patients/${item.patientId}` : null,
      bookHref: bookingHref(item.patientId, item.name, item.phone),
      primaryLabel: item.isPatient ? "Book them in" : "Message and book",
      lost: item.lost,
    };
  });

  const overdue = queue.counts.overdue;
  const reachedTop = Math.max(1, metrics.gotInTouch);
  const funnel = [
    { label: "People who got in touch", value: metrics.gotInTouch, bar: "var(--chart-1)" },
    { label: "We actually reached", value: metrics.reached, bar: "var(--chart-2)" },
    { label: "Booked a visit", value: metrics.bookedAVisit, bar: "var(--chart-3)" },
    { label: "Came and were treated", value: metrics.treated, bar: "var(--chart-4)" },
  ];

  const filterLabel = QUEUE_FILTERS.find((option) => option.value === filter)?.label ?? "Due today";

  return (
    <WorkPage
      title="People to contact"
      sub={
        overdue > 0
          ? `${overdue} ${overdue === 1 ? "person" : "people"} waited longer than you promised.`
          : "Nothing overdue. Nice."
      }
      actions={
        <Link
          href={listHref(BASE, view, { log: "1", invalid: "" })}
          className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          Log an enquiry
        </Link>
      }
      context={
        <>
          {query.filters.log === "1" && (
            <LogEnquiry
              wants={services.length ? services.map((service) => service.name) : DEFAULT_WANTS}
              closeHref={href({})}
              invalid={query.filters.invalid === "1"}
            />
          )}

          <RailCard title="This month so far">
            {funnel.map((step) => (
              <div key={step.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-text-muted">{step.label}</span>
                  <span className="font-semibold tabular-nums text-heading">{step.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-pill bg-muted">
                  <div
                    className="h-full rounded-pill"
                    style={{
                      width: `${Math.round((step.value / reachedTop) * 100)}%`,
                      background: step.bar,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-text-muted sm:col-span-full">
              {metrics.conversion}% of enquiries became treated patients — {metrics.conversionSentence}.
              Insights uses this same number; there is only one.
            </p>
          </RailCard>
        </>
      }
    >
      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch placeholder="Name or number" label="Search this queue" />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={view}
            name="show"
            legend="Show"
            options={QUEUE_FILTERS.map((option) => ({
              value: option.value,
              label: option.label,
              count: queue.counts[option.value],
              tone: option.value === "overdue" && queue.counts.overdue > 0 ? ("danger" as const) : undefined,
            }))}
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Showing {rows.length} of {queue.total} in this filter · {queue.counts.everyone} in the whole
          queue. Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      <GrowthQueue
        title={filter === "everyone" ? "Everyone in the queue" : filterLabel}
        rows={rows}
        pageNote={`Page ${queue.page} of ${queue.pages} · ${queue.total} ${queue.total === 1 ? "person" : "people"}`}
        outcomes={CLOSE_OUTCOMES.map((outcome) => ({ value: outcome.value, label: outcome.label }))}
        teammates={teammates}
        canMessage={can(user.role, "sendWhatsApp")}
        emptyTitle={
          filter === "overdue"
            ? "Nothing overdue. Nice."
            : query.q
              ? `Nobody matches “${query.q}”`
              : filter === "lost"
                ? "Nobody has been written off"
                : "This list is clear"
        }
        emptyBody={
          query.q
            ? "Try a phone number, or log them as a new enquiry."
            : filter === "lost"
              ? "Anyone you press Done on with a reason turns up here, and can be brought back."
              : "Anyone who calls, messages or misses a visit lands here on their own."
        }
        footer={
          queue.pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center gap-1">
              <Link
                href={href({ page: queue.page - 1 })}
                aria-disabled={queue.page <= 1}
                className={`inline-flex h-9 items-center rounded-control border border-border px-3 font-semibold ${
                  queue.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                Back
              </Link>
              <Link
                href={href({ page: queue.page + 1 })}
                aria-disabled={queue.page >= queue.pages}
                className={`inline-flex h-9 items-center rounded-control border border-border px-3 font-semibold ${
                  queue.page >= queue.pages ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                Next
              </Link>
            </nav>
          ) : null
        }
      />

      <RailCard title="Where they came from">
        {metrics.sources.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            Nobody has got in touch this month, so there is nothing to count yet.
          </p>
        ) : (
          metrics.sources.slice(0, 6).map((source) => (
            <div key={source.label} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{source.label}</span>
              <span className="tabular-nums text-text-muted">
                {source.enquiries} · {source.treated} treated
              </span>
            </div>
          ))
        )}
        {can(user.role, "exportData") && (
          <Link href="/dashboard/insights" className="text-xs font-semibold text-primary hover:underline">
            See the full picture in Insights
          </Link>
        )}
      </RailCard>

      <RailCard title="Why people did not come">
        {metrics.lossReasons.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            Nobody has been written off this month. Reasons are recorded when you press Done and pick
            one.
          </p>
        ) : (
          metrics.lossReasons.slice(0, 6).map((reason) => (
            <div key={reason.label} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground">{reason.label}</span>
              <span className="tabular-nums text-text-muted">{reason.count}</span>
            </div>
          ))
        )}
      </RailCard>
    </WorkPage>
  );
}
