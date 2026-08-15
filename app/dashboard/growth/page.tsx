export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { PhoneCall, Sprout } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanLabel, humanTime, overdueBy, rupees } from "@/lib/format";
import { growthMetrics, rangeFor } from "@/lib/metrics";
import { listHref, pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";

const BASE = "/dashboard/growth";

const ENQUIRY_COLUMNS = [
  { key: "who", label: "Who", sortKey: "who" },
  { key: "phone", label: "Phone", secondary: true },
  { key: "want", label: "What they asked about", secondary: true },
  { key: "from", label: "Where from", secondary: true },
  { key: "stage", label: "How far" },
  { key: "next", label: "Next nudge" },
];

const CALLBACK_COLUMNS = [
  { key: "who", label: "Who" },
  { key: "why", label: "Why" },
  { key: "due", label: "Due", sortKey: "due" },
  { key: "tries", label: "Tried", align: "right" as const, secondary: true },
  { key: "open", label: "", align: "right" as const },
];

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("managePatients");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultSort: "due", defaultDir: "asc", filterKeys: ["tab", "show"] });

  const now = new Date();
  const tab = query.filters.tab === "callbacks" ? "callbacks" : "enquiries";
  const show = query.filters.show ?? "";

  const metrics = await growthMetrics({ clinicId: user.clinicId }, rangeFor("month", now));

  const enquirySearch: Prisma.LeadWhereInput = query.q
    ? {
        OR: [
          { fullName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q.replace(/\D/g, "") || query.q } },
          { serviceInterest: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const enquiryWhere: Prisma.LeadWhereInput = {
    clinicId: user.clinicId,
    ...enquirySearch,
    ...(show === "new" ? { stage: "NEW" } : {}),
    ...(show === "talking" ? { stage: { in: ["CONTACTED", "BOOKED"] } } : {}),
    ...(show === "lost" ? { stage: "LOST" } : {}),
    ...(show === "overdue" ? { nextFollowUpAt: { lte: now }, stage: { notIn: ["CONVERTED", "LOST"] } } : {}),
  };

  const callbackSearch: Prisma.FollowUpTaskWhereInput = query.q
    ? {
        OR: [
          { patientName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q.replace(/\D/g, "") || query.q } },
          { message: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const callbackWhere: Prisma.FollowUpTaskWhereInput = {
    clinicId: user.clinicId,
    ...callbackSearch,
    ...(show === "overdue"
      ? { status: { in: ["PENDING", "FAILED"] }, scheduledFor: { lte: now } }
      : show === "done"
        ? { status: "COMPLETED" }
        : { status: { in: ["PENDING", "QUEUED", "SENT", "FAILED"] } }),
  };

  const total =
    tab === "enquiries"
      ? await prisma.lead.count({ where: enquiryWhere })
      : await prisma.followUpTask.count({ where: callbackWhere });
  const { skip, take } = pageWindow(query, total);

  const [enquiries, callbacks, callbackCount] = await Promise.all([
    tab === "enquiries"
      ? prisma.lead.findMany({
          where: enquiryWhere,
          orderBy: query.sort === "who" ? { fullName: query.dir } : { nextFollowUpAt: query.dir },
          skip,
          take,
          select: {
            id: true,
            fullName: true,
            phone: true,
            serviceInterest: true,
            source: true,
            stage: true,
            nextFollowUpAt: true,
            conversionValue: true,
            patientId: true,
          },
        })
      : [],
    tab === "callbacks"
      ? prisma.followUpTask.findMany({
          where: callbackWhere,
          orderBy: { scheduledFor: query.dir },
          skip,
          take,
          select: {
            id: true,
            patientName: true,
            phone: true,
            message: true,
            taskType: true,
            status: true,
            scheduledFor: true,
            attemptCount: true,
            patientId: true,
            leadId: true,
          },
        })
      : [],
    prisma.followUpTask.count({
      where: { clinicId: user.clinicId, status: { in: ["PENDING", "FAILED"] }, scheduledFor: { lte: now } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Growth"
        sub={`${metrics.conversion}% became patients this month — ${metrics.conversionSentence}. One calculation, shared with Insights.`}
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        {[
          { label: "People got in touch", value: String(metrics.gotInTouch), note: "calls, WhatsApp, walk-ins" },
          {
            label: "Became patients",
            value: `${metrics.conversion}%`,
            note: metrics.conversionSentence,
          },
          {
            label: "Worth of new patients",
            value: rupees(metrics.worthOfNewPatients),
            note: "treated in their first month",
          },
          {
            label: "Patients to call back",
            value: String(callbackCount),
            note: callbackCount ? "past their date" : "nothing overdue, nice",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]"
          >
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
              {tile.label}
            </p>
            <p className="text-2xl font-bold tabular-nums text-heading">{tile.value}</p>
            <p className="text-xs text-text-muted">{tile.note}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Growth sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {[
          { value: "enquiries", label: "Enquiries" },
          { value: "callbacks", label: "Patients to call back" },
        ].map((option) => (
          <Link
            key={option.value}
            href={listHref(BASE, query, { tab: option.value, show: "", page: 1 })}
            role="tab"
            aria-selected={tab === option.value}
            className={`inline-flex min-h-[42px] flex-none items-center border-b-2 px-3.5 text-[13px] font-semibold ${
              tab === option.value
                ? "border-b-primary text-heading"
                : "border-b-transparent text-text-muted hover:text-heading"
            }`}
          >
            {option.label}
            {option.value === "callbacks" && callbackCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-[11px] font-bold text-white">
                {callbackCount}
              </span>
            )}
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch
              placeholder={tab === "enquiries" ? "Name, phone or what they asked about" : "Name, phone or why"}
              label={tab === "enquiries" ? "Search enquiries" : "Search callbacks"}
            />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the list"
            options={
              tab === "enquiries"
                ? [
                    { value: "overdue", label: "Nudge overdue" },
                    { value: "new", label: "Not called yet" },
                    { value: "talking", label: "Talking" },
                    { value: "lost", label: "Went elsewhere" },
                  ]
                : [
                    { value: "overdue", label: "Overdue" },
                    { value: "done", label: "Done" },
                  ]
            }
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      {tab === "enquiries" ? (
        <DataList
          basePath={BASE}
          query={query}
          columns={ENQUIRY_COLUMNS}
          total={total}
          shown={enquiries.length}
          noun="enquiries"
          empty={
            <EmptyState
              icon={Sprout}
              title={query.q ? `Nothing matches “${query.q}”` : "Nobody has got in touch yet"}
              body={
                query.q
                  ? "Try a phone number, or clear the filters."
                  : "Enquiries from WhatsApp, the website and walk-ins all land here."
              }
            />
          }
        >
          {enquiries.map((lead) => {
            const late = lead.nextFollowUpAt ? overdueBy(lead.nextFollowUpAt, now) : null;
            return (
              <ListRow key={lead.id} needsAttention={Boolean(late)}>
                <ListCell>
                  {lead.patientId ? (
                    <Link
                      href={`/dashboard/patients/${lead.patientId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {lead.fullName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{lead.fullName}</span>
                  )}
                </ListCell>
                <ListCell secondary>
                  <span className="tabular-nums text-text-muted">{lead.phone}</span>
                </ListCell>
                <ListCell secondary>
                  <span className="text-text-muted">{lead.serviceInterest || "Not said"}</span>
                </ListCell>
                <ListCell secondary>
                  <span className="text-text-muted">{lead.source}</span>
                </ListCell>
                <ListCell>
                  <span
                    className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${
                      lead.stage === "CONVERTED"
                        ? "bg-success-bg text-success"
                        : lead.stage === "LOST"
                          ? "bg-danger-bg text-danger"
                          : "bg-muted text-heading"
                    }`}
                  >
                    {lead.stage === "CONVERTED"
                      ? "Treated"
                      : lead.stage === "NEW"
                        ? "Not called yet"
                        : humanLabel(lead.stage)}
                  </span>
                </ListCell>
                <ListCell>
                  {lead.nextFollowUpAt ? (
                    <span
                      title={exactStamp(lead.nextFollowUpAt)}
                      className={late ? "font-semibold text-danger" : "text-text-muted"}
                    >
                      {late ?? humanTime(lead.nextFollowUpAt, now)}
                    </span>
                  ) : (
                    <span className="text-text-muted">nothing planned</span>
                  )}
                </ListCell>
              </ListRow>
            );
          })}
        </DataList>
      ) : (
        <DataList
          basePath={BASE}
          query={query}
          columns={CALLBACK_COLUMNS}
          total={total}
          shown={callbacks.length}
          noun="callbacks"
          empty={
            <EmptyState
              icon={PhoneCall}
              title={query.q ? `Nothing matches “${query.q}”` : "Nothing overdue. Nice."}
              body={
                query.q
                  ? "Try a phone number, or clear the filters."
                  : "Anyone who needs chasing will turn up here the moment they do."
              }
            />
          }
        >
          {callbacks.map((task) => {
            const late = overdueBy(task.scheduledFor, now);
            return (
              <ListRow key={task.id} needsAttention={Boolean(late)}>
                <ListCell>
                  {task.patientId ? (
                    <Link
                      href={`/dashboard/patients/${task.patientId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {task.patientName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{task.patientName}</span>
                  )}
                  <span className="block text-xs tabular-nums text-text-muted">{task.phone}</span>
                </ListCell>
                <ListCell>
                  <span className="block truncate text-text-muted">{task.message}</span>
                </ListCell>
                <ListCell>
                  <span
                    title={exactStamp(task.scheduledFor)}
                    className={late ? "font-semibold text-danger" : "text-text-muted"}
                  >
                    {late ?? humanTime(task.scheduledFor, now)}
                  </span>
                </ListCell>
                <ListCell align="right" secondary>
                  <span className="tabular-nums">{task.attemptCount}</span>
                </ListCell>
                <ListCell align="right">
                  <Link href={`/dashboard/patients/${task.patientId ?? ""}`} className="text-xs font-semibold text-primary">
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
