import Link from "next/link";
import { Suspense } from "react";
import { ReceiptIndianRupee } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requireFeature } from "@/lib/features";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, overdueBy, rupees } from "@/lib/format";
import { moneyMetrics, rangeFor } from "@/lib/metrics";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";
import CollectRow from "@/components/money/CollectRow";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/billing";
const OVERDUE_DAYS = 14;

const COLUMNS = [
  { key: "no", label: "Invoice", sortKey: "no" },
  { key: "patient", label: "Patient" },
  { key: "items", label: "For", secondary: true },
  { key: "amount", label: "Total", sortKey: "amount", align: "right" as const },
  { key: "due", label: "Still due", align: "right" as const },
  { key: "status", label: "Status" },
  { key: "collect", label: "Collect", align: "right" as const, width: "200px" },
];

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requireFeature("billing");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultSort: "no", defaultDir: "desc", filterKeys: ["show"] });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdueCutoff = new Date(now.getTime() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
  const show = query.filters.show ?? "";
  const canVoid = can(user.role, "manageBilling");

  const search: Prisma.InvoiceWhereInput = query.q
    ? {
        OR: [
          { invoiceNumber: { contains: query.q, mode: "insensitive" } },
          { patient: { fullName: { contains: query.q, mode: "insensitive" } } },
          { lineItems: { some: { description: { contains: query.q, mode: "insensitive" } } } },
        ],
      }
    : {};

  const scoped: Prisma.InvoiceWhereInput = {
    clinicId: user.clinicId, voidedAt: null,
    ...search,
    ...(show === "due" ? { status: { not: "Paid" } } : {}),
    ...(show === "overdue" ? { status: { not: "Paid" }, issueDate: { lt: overdueCutoff } } : {}),
    ...(show === "today" ? { issueDate: { gte: startOfDay } } : {}),
    ...(show === "settled" ? { status: "Paid" } : {}),
  };

  const total = await prisma.invoice.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [invoices, metrics, collectedToday] = await Promise.all([
    prisma.invoice.findMany({
      where: scoped,
      orderBy: query.sort === "amount" ? { totalAmount: query.dir } : { issueDate: query.dir },
      skip,
      take,
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        issueDate: true,
        patientId: true,
        patient: { select: { fullName: true } },
        lineItems: { select: { description: true }, take: 3 },
        payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
      },
    }),
    moneyMetrics({ clinicId: user.clinicId }, rangeFor("month", now)),
    prisma.payment.aggregate({
      where: {
        clinicId: user.clinicId,
        status: "POSTED",
        reversedAt: null,
        paidAt: { gte: startOfDay },
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const overdueBucket = metrics.ageing.filter((bucket) => bucket.tone !== "normal");
  const overdueAmount = overdueBucket.reduce((sum, bucket) => sum + bucket.amount, 0);
  const overdueCount = overdueBucket.reduce((sum, bucket) => sum + bucket.count, 0);

  const tiles = [
    {
      label: "Collected today",
      value: rupees(collectedToday._sum.amount ?? 0),
      note: `across ${collectedToday._count} payment${collectedToday._count === 1 ? "" : "s"}`,
      tone: "text-success",
    },
    {
      label: "Money still with patients",
      value: rupees(metrics.stillOwed),
      note: `${metrics.owedByPatients} ${metrics.owedByPatients === 1 ? "patient" : "patients"} owe it`,
      tone: "text-heading",
    },
    {
      label: "Sitting more than 30 days",
      value: rupees(overdueAmount),
      note: `${overdueCount} to chase — the longer it sits, the harder it gets`,
      tone: "text-danger",
    },
    {
      label: "Treated this month",
      value: rupees(metrics.treated),
      note: "work done, paid or not · same source as Insights",
      tone: "text-heading",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Money"
        sub="Every figure here comes from the shared metrics module, so Insights always agrees."
        actions={
          <Link
            href="/dashboard/billing/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            New invoice
          </Link>
        }
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]"
          >
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
              {tile.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
            <p className="text-xs text-text-muted">{tile.note}</p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch placeholder="Patient, invoice number or treatment" label="Search invoices" />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the invoices"
            options={[
              { value: "due", label: "Money due" },
              { value: "overdue", label: `Overdue ${OVERDUE_DAYS} days+` },
              { value: "today", label: "Today" },
              { value: "settled", label: "Settled" },
            ]}
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — share this view with the owner.
        </p>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={invoices.length}
        noun="invoices"
        empty={
          <EmptyState
            icon={ReceiptIndianRupee}
            title={query.q ? `Nothing matches “${query.q}”` : "Nothing billed yet"}
            body={
              query.q
                ? "Try an invoice number, or clear the filters."
                : "Bill the patient in the chair and it shows up here straight away."
            }
            action={{ label: "New invoice", href: "/dashboard/billing/new" }}
          />
        }
      >
        {invoices.map((invoice) => {
          const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
          const due = invoice.totalAmount - paid;
          const late = due > 0 ? overdueBy(overdueCutoff > invoice.issueDate ? invoice.issueDate : now, now) : null;
          const status =
            due <= 0 ? "Settled" : invoice.issueDate < overdueCutoff ? "Overdue" : paid > 0 ? "Part paid" : "Unpaid";

          return (
            <ListRow key={invoice.id} needsAttention={status === "Overdue"}>
              <ListCell>
                <Link
                  href={`/dashboard/billing/${invoice.id}`}
                  className="font-semibold tabular-nums text-primary hover:underline"
                >
                  {invoice.invoiceNumber}
                </Link>
              </ListCell>
              <ListCell>
                <Link
                  href={`/dashboard/patients/${invoice.patientId}`}
                  className="truncate text-primary hover:underline"
                >
                  {invoice.patient.fullName}
                </Link>
              </ListCell>
              <ListCell secondary>
                <span className="block truncate text-text-muted">
                  {invoice.lineItems.map((line) => line.description).join(", ") || "Treatment"}
                </span>
                <span title={exactStamp(invoice.issueDate)} className="block text-xs text-text-muted">
                  {humanTime(invoice.issueDate, now)}
                </span>
              </ListCell>
              <ListCell align="right">
                <span className="tabular-nums">{rupees(invoice.totalAmount)}</span>
              </ListCell>
              <ListCell align="right">
                {due > 0 ? (
                  <span className="font-semibold tabular-nums text-danger">{rupees(due)}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </ListCell>
              <ListCell>
                <span
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${
                    status === "Settled"
                      ? "bg-success-bg text-success"
                      : status === "Overdue"
                        ? "bg-danger-bg text-danger"
                        : "bg-warning-bg text-warning"
                  }`}
                >
                  {status === "Overdue" && late ? `Overdue, ${late}` : status}
                </span>
              </ListCell>
              <ListCell align="right">
                <CollectRow
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoiceNumber}
                  patientName={invoice.patient.fullName}
                  due={due}
                  total={invoice.totalAmount}
                  paid={paid}
                  canVoid={canVoid}
                />
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>
    </div>
  );
}
