import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/treatment-plans";

/** What the clinic calls each plan state. `Cancelled` means the patient said no. */
const STATE = {
  Proposed: { label: "Waiting on a yes", tone: "bg-warning-bg text-warning", bar: "bg-warning" },
  Accepted: { label: "In progress", tone: "bg-secondary text-heading", bar: "bg-primary" },
  "In Progress": { label: "In progress", tone: "bg-secondary text-heading", bar: "bg-primary" },
  Completed: { label: "Finished", tone: "bg-success-bg text-success", bar: "bg-success" },
  Cancelled: { label: "Turned down", tone: "bg-danger-bg text-danger", bar: "bg-text-muted" },
} as const;

export default async function TreatmentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewClinical");
  const planId = Number((await params).id);
  if (!Number.isInteger(planId)) notFound();

  const plan = await prisma.treatmentPlan.findFirst({
    where: { id: planId, clinicId: user.clinicId, cancelledAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      estimatedCost: true,
      notes: true,
      visitDate: true,
      updatedAt: true,
      createdAt: true,
      patientId: true,
      patient: { select: { id: true, fullName: true, phone: true } },
      provider: { select: { name: true } },
      author: { select: { fullName: true } },
      selectedTeeth: { select: { toothNumber: true } },
      items: { select: { id: true, name: true, price: true }, orderBy: { id: "asc" } },
      invoices: {
        where: { voidedAt: null },
        orderBy: { issueDate: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          issueDate: true,
          payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
        },
      },
    },
  });
  if (!plan) notFound();

  const now = new Date();
  const state = STATE[plan.status as keyof typeof STATE] ?? {
    label: plan.status,
    tone: "bg-muted text-heading",
    bar: "bg-primary",
  };
  const itemsTotal = plan.items.reduce((sum, item) => sum + item.price, 0);
  const priced = plan.estimatedCost ?? itemsTotal;
  const invoiced = plan.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const collected = plan.invoices.reduce(
    (sum, invoice) => sum + invoice.payments.reduce((total, payment) => total + payment.amount, 0),
    0,
  );
  const pct = priced > 0 ? Math.min(100, Math.round((invoiced / priced) * 100)) : 0;
  const teeth = plan.selectedTeeth.map((tooth) => tooth.toothNumber);
  const canEdit = can(user.role, "manageClinical");

  return (
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={BASE} className="text-xs font-semibold text-primary hover:underline">
            ← Treatment plans
          </Link>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading">{plan.title}</h1>
            <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${state.tone}`}>
              {state.label}
            </span>
          </div>
          <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            <Link href={`/dashboard/patients/${plan.patientId}`} className="font-semibold text-primary hover:underline">
              {plan.patient.fullName}
            </Link>
            {" · "}
            <span className="tabular-nums">{plan.patient.phone}</span>
            {plan.provider?.name ? ` · ${plan.provider.name}` : ""}
            {" · agreed "}
            <span title={exactStamp(plan.visitDate ?? plan.createdAt)}>
              {humanTime(plan.visitDate ?? plan.createdAt, now)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link
              href={`${BASE}/${plan.id}/edit`}
              className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Edit this plan
            </Link>
          )}
          {can(user.role, "manageBilling") && (
            <Link
              href={`/dashboard/billing/new?patientId=${plan.patientId}`}
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              Raise an invoice
            </Link>
          )}
          <Link
            href={`/dashboard/appointments/new?patientId=${plan.patientId}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Book the next sitting
          </Link>
        </div>
      </header>

      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">Plan is worth</p>
            <p className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading tabular-nums">
              {priced > 0 ? rupees(priced) : "not priced"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">Invoiced so far</p>
            <p className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading tabular-nums">{rupees(invoiced)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">Collected</p>
            <p className="text-[22px] leading-tight font-bold tabular-nums text-success">{rupees(collected)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">Still to bill</p>
            <p className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading tabular-nums">
              {rupees(Math.max(0, priced - invoiced))}
            </p>
          </div>
        </div>
        {priced > 0 && (
          <div className="mt-3.5">
            <span className="block h-2 w-full overflow-hidden rounded-pill bg-muted" role="img" aria-label={`${pct}% invoiced`}>
              <span className={`block h-full ${state.bar}`} style={{ width: `${pct}%` }} />
            </span>
            <p className="mt-1.5 text-xs text-text-muted">
              {rupees(invoiced)} of {rupees(priced)} invoiced — progress is measured against what has been billed.
            </p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-2.5">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The work in this plan</h2>
          <span className="text-xs text-text-muted">
            {teeth.length ? `Teeth ${teeth.join(", ")}` : "Not tooth-specific"}
          </span>
        </div>
        {plan.items.length === 0 ? (
          <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            No treatments listed yet. Edit the plan to add what you agreed.
          </p>
        ) : (
          <>
            {plan.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 border-t border-border px-5.5 py-2.5"
              >
                <span className="text-[13px] text-foreground">{item.name}</span>
                <span className="text-[13px] font-semibold tabular-nums text-heading">{rupees(item.price)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted px-5.5 py-2.5">
              <span className="text-[13px] font-semibold text-heading">Total</span>
              <span className="text-[13px] font-bold tabular-nums text-heading">{rupees(itemsTotal)}</span>
            </div>
          </>
        )}
      </section>

      {plan.notes?.trim() && (
        <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Notes</h2>
          <p className="mt-1.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] whitespace-pre-wrap text-foreground">{plan.notes}</p>
        </section>
      )}

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-2.5">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Invoices raised against this plan</h2>
          <span className="text-xs text-text-muted">
            {plan.invoices.length === 0
              ? "Nothing billed yet"
              : `${plan.invoices.length} ${plan.invoices.length === 1 ? "invoice" : "invoices"}`}
          </span>
        </div>
        {plan.invoices.length === 0 ? (
          <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            Nothing billed yet. Raise an invoice when the first sitting is done.
          </p>
        ) : (
          plan.invoices.map((invoice) => {
            const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
            const due = Math.max(0, invoice.totalAmount - paid);
            return (
              <div
                key={invoice.id}
                className="grid items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[130px_minmax(0,1fr)_120px_120px]"
              >
                <Link
                  href={`/dashboard/billing/${invoice.id}`}
                  className="text-[13px] font-semibold tabular-nums text-primary hover:underline"
                >
                  {invoice.invoiceNumber}
                </Link>
                <span title={exactStamp(invoice.issueDate)} className="text-[13px] text-text-muted">
                  raised {humanTime(invoice.issueDate, now)}
                </span>
                <span className="text-[13px] tabular-nums">{rupees(invoice.totalAmount)}</span>
                <span
                  className={`text-[13px] font-semibold tabular-nums ${due > 0 ? "text-danger" : "text-success"}`}
                >
                  {due > 0 ? `${rupees(due)} left` : "Paid"}
                </span>
              </div>
            );
          })
        )}
      </section>

      <p className="text-xs text-text-muted">
        Last touched <span title={exactStamp(plan.updatedAt)}>{humanTime(plan.updatedAt, now)}</span>
        {plan.author?.fullName ? ` by ${plan.author.fullName}` : ""}. Editing keeps this plan&rsquo;s history.
      </p>
    </div>
  );
}
