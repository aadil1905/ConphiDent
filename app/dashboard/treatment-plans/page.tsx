import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, rupees } from "@/lib/format";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/treatment-plans";

const COLUMNS = [
  { key: "patient", label: "Patient" },
  { key: "plan", label: "Plan", sortKey: "plan" },
  { key: "value", label: "Worth", sortKey: "value", align: "right" as const },
  { key: "progress", label: "How far along", secondary: true },
  { key: "status", label: "Where it stands" },
  { key: "next", label: "Next step", align: "right" as const },
];

/** What the clinic calls each plan state, and how it is coloured. */
const STATE = {
  Proposed: { label: "Waiting on a yes", tone: "bg-warning-bg text-warning", bar: "bg-warning" },
  Accepted: { label: "In progress", tone: "bg-secondary text-heading", bar: "bg-primary" },
  "In Progress": { label: "In progress", tone: "bg-secondary text-heading", bar: "bg-primary" },
  Completed: { label: "Finished", tone: "bg-success-bg text-success", bar: "bg-success" },
  Cancelled: { label: "Turned down", tone: "bg-danger-bg text-danger", bar: "bg-text-muted" },
} as const;

function stateOf(status: string) {
  return STATE[status as keyof typeof STATE] ?? { label: status, tone: "bg-muted text-heading", bar: "bg-primary" };
}

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <div className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">{label}</p>
      <p className={`text-2xl leading-tight font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-text-muted">{note}</p>
    </div>
  );
}

export default async function TreatmentPlansPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("viewClinical");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultSort: "agreed", defaultDir: "desc", filterKeys: ["show"] });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthName = monthStart.toLocaleDateString("en-IN", { month: "long" });
  const show = query.filters.show ?? "";

  const search: Prisma.TreatmentPlanWhereInput = query.q
    ? {
        OR: [
          { title: { contains: query.q, mode: "insensitive" } },
          { notes: { contains: query.q, mode: "insensitive" } },
          { patient: { fullName: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : {};

  const scoped: Prisma.TreatmentPlanWhereInput = {
    clinicId: user.clinicId,
    cancelledAt: null,
    ...search,
    ...(show === "quoted" ? { status: "Proposed" } : {}),
    ...(show === "running" ? { status: { in: ["Accepted", "In Progress"] } } : {}),
    ...(show === "done" ? { status: "Completed" } : {}),
    ...(show === "declined" ? { status: "Cancelled" } : {}),
  };

  const total = await prisma.treatmentPlan.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [plans, waiting, running, finished, declined] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: scoped,
      orderBy:
        query.sort === "plan"
          ? { title: query.dir }
          : query.sort === "value"
            ? { estimatedCost: query.dir }
            : { updatedAt: query.dir },
      skip,
      take,
      select: {
        id: true,
        title: true,
        status: true,
        estimatedCost: true,
        updatedAt: true,
        patientId: true,
        patient: { select: { fullName: true } },
        invoices: { where: { voidedAt: null }, select: { totalAmount: true } },
      },
    }),
    prisma.treatmentPlan.aggregate({
      where: { clinicId: user.clinicId, cancelledAt: null, status: "Proposed" },
      _sum: { estimatedCost: true },
      _count: true,
    }),
    prisma.treatmentPlan.aggregate({
      where: { clinicId: user.clinicId, cancelledAt: null, status: { in: ["Accepted", "In Progress"] } },
      _sum: { estimatedCost: true },
      _count: true,
    }),
    prisma.treatmentPlan.aggregate({
      where: {
        clinicId: user.clinicId,
        cancelledAt: null,
        status: "Completed",
        updatedAt: { gte: monthStart },
      },
      _sum: { estimatedCost: true },
      _count: true,
    }),
    prisma.treatmentPlan.aggregate({
      where: {
        clinicId: user.clinicId,
        cancelledAt: null,
        status: "Cancelled",
        updatedAt: { gte: monthStart },
      },
      _sum: { estimatedCost: true },
      _count: true,
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Treatment plans"
        sub="What you agreed with each patient, what it is worth, and how far along it is."
        actions={
          <Link
            href="/dashboard/treatment-plans/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            New plan
          </Link>
        }
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        <Tile
          label="Waiting on a yes"
          value={String(waiting._count)}
          note={`${rupees(waiting._sum.estimatedCost ?? 0)} at stake`}
          tone="text-warning"
        />
        <Tile
          label="In progress"
          value={String(running._count)}
          note={`${rupees(running._sum.estimatedCost ?? 0)} agreed`}
          tone="text-heading"
        />
        <Tile
          label={`Finished in ${monthName}`}
          value={String(finished._count)}
          note={`${rupees(finished._sum.estimatedCost ?? 0)} of work`}
          tone="text-success"
        />
        <Tile
          label={`Turned down in ${monthName}`}
          value={String(declined._count)}
          note={
            declined._count
              ? `${rupees(declined._sum.estimatedCost ?? 0)} walked away`
              : "nobody said no"
          }
          tone={declined._count ? "text-danger" : "text-text-muted"}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch placeholder="Patient or procedure — filters as you type" label="Search plans" />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the plans"
            options={[
              { value: "running", label: "In progress" },
              { value: "quoted", label: "Waiting on a yes" },
              { value: "done", label: "Finished" },
              { value: "declined", label: "Turned down" },
            ]}
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={plans.length}
        noun="plans"
        empty={
          <EmptyState
            icon={ClipboardList}
            title={query.q ? `No plans match “${query.q}”` : "No plans agreed yet"}
            body={
              query.q
                ? "Try a patient name, or clear the filters."
                : "Agree what needs doing with a patient and it shows up here with its progress."
            }
            action={{ label: "New plan", href: "/dashboard/treatment-plans/new" }}
          />
        }
      >
        {plans.map((plan) => {
          const state = stateOf(plan.status);
          const invoiced = plan.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
          const priced = plan.estimatedCost ?? 0;
          const pct = priced > 0 ? Math.min(100, Math.round((invoiced / priced) * 100)) : 0;
          const chase = plan.status === "Proposed";
          const running = plan.status === "Accepted" || plan.status === "In Progress";
          return (
            <ListRow key={plan.id} needsAttention={chase}>
              <ListCell>
                <Link
                  href={`/dashboard/patients/${plan.patientId}?tab=Plans`}
                  className="font-semibold text-primary hover:underline"
                >
                  {plan.patient.fullName}
                </Link>
              </ListCell>
              <ListCell>
                <Link href={`${BASE}/${plan.id}/edit`} className="block text-foreground hover:underline">
                  {plan.title}
                </Link>
                <span title={exactStamp(plan.updatedAt)} className="block text-xs text-text-muted">
                  last touched {humanTime(plan.updatedAt, now)}
                </span>
              </ListCell>
              <ListCell align="right">
                <span className="tabular-nums">{priced > 0 ? rupees(priced) : "not priced"}</span>
              </ListCell>
              <ListCell secondary>
                {priced > 0 ? (
                  <>
                    <span
                      className="block h-[7px] w-full overflow-hidden rounded-pill bg-muted"
                      role="img"
                      aria-label={`${pct}% invoiced`}
                    >
                      <span className={`block h-full ${state.bar}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="mt-1 block text-[11px] text-text-muted">
                      {rupees(invoiced)} of {rupees(priced)} invoiced
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-text-muted">no price on the plan yet</span>
                )}
              </ListCell>
              <ListCell>
                <span
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${state.tone}`}
                >
                  {state.label}
                </span>
              </ListCell>
              <ListCell align="right">
                <Link
                  href={
                    running
                      ? `/dashboard/appointments/new?patientId=${plan.patientId}`
                      : `${BASE}/${plan.id}/edit`
                  }
                  className={`inline-flex min-h-11 items-center justify-center rounded-control px-3.5 text-[13px] font-semibold whitespace-nowrap ${
                    chase
                      ? "border border-primary bg-primary text-white hover:bg-primary-hover"
                      : "border border-border-strong bg-card text-heading hover:bg-muted"
                  }`}
                >
                  {chase ? "Chase it" : running ? "Book next" : "Open plan"}
                </Link>
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>
    </div>
  );
}
