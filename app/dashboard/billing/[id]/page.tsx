export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/features";
import { can } from "@/lib/permissions";
import { clinicDisplayName } from "@/lib/clinic-config";
import { buildInvoiceDocument } from "@/lib/billing-document";
import { CreditCard } from "lucide-react";
import { exactStamp, humanLabel, humanTime, overdueBy, rupees } from "@/lib/format";
import SendInvoiceWhatsAppButton from "@/components/billing/SendInvoiceWhatsAppButton";
import CollectRow from "@/components/money/CollectRow";
import { reversePaymentAction } from "./actions";

/** A quiet colour per kind of event, always paired with the words beside it. */
const EVENT_DOT: Record<string, string> = {
  BILLING_DOCUMENT_CREATED: "bg-primary",
  PAYMENT_RECORDED: "bg-success",
  PAYMENT_REVERSED: "bg-warning",
  INVOICE_VOIDED: "bg-danger-mark",
};

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromPatient?: string; visit?: string }>;
}) {
  const user = await requireFeature("billing");
  const { id } = await params;
  const { fromPatient, visit } = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clinicId: user.clinicId, voidedAt: null },
    include: {
      patient: true,
      treatmentPlan: {
        include: {
          selectedTeeth: { orderBy: { toothNumber: "asc" } },
          items: { orderBy: { id: "asc" } },
        },
      },
      payments: { orderBy: { paidAt: "desc" } },
      lineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!invoice) notFound();

  // Everything that has happened to this invoice, and what the patient owes
  // across their whole file — both read from the same places the rest of the
  // workspace reads them.
  const [trail, patientInvoices, plansPending, visitNote] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [
          { entityType: "INVOICE", entityId: String(invoice.id) },
          ...(invoice.payments.length
            ? [{ entityType: "PAYMENT", entityId: { in: invoice.payments.map((p) => String(p.id)) } }]
            : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        detail: true,
        reason: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { clinicId: user.clinicId, patientId: invoice.patientId, voidedAt: null },
      select: {
        totalAmount: true,
        payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
      },
    }),
    prisma.treatmentPlan.aggregate({
      where: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        cancelledAt: null,
        status: { in: ["Proposed", "Accepted", "In Progress"] },
      },
      _sum: { estimatedCost: true },
    }),
    invoice.encounterId
      ? prisma.clinicalRecord.findFirst({
          where: { clinicId: user.clinicId, encounterId: invoice.encounterId, enteredInErrorAt: null },
          orderBy: { visitDate: "desc" },
          select: { id: true },
        })
      : null,
  ]);

  const lifetimePaid = patientInvoices.reduce(
    (sum, item) => sum + item.payments.reduce((total, payment) => total + payment.amount, 0),
    0,
  );
  const lifetimeBalance = patientInvoices.reduce((sum, item) => {
    const settled = item.payments.reduce((total, payment) => total + payment.amount, 0);
    return sum + Math.max(0, item.totalAmount - settled);
  }, 0);

  const now = new Date();
  const posted = invoice.payments.filter((payment) => payment.status === "POSTED" && !payment.reversedAt);
  const paid = posted.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = invoice.totalAmount - paid;
  const late = outstanding > 0 && invoice.dueDate ? overdueBy(invoice.dueDate, now) : null;
  const status = outstanding <= 0 ? "Settled" : late ? "Overdue" : paid > 0 ? "Part paid" : "Unpaid";
  const acceptsPayments = ["TAX_INVOICE", "NON_TAX_INVOICE"].includes(invoice.documentType);

  const document = buildInvoiceDocument({ clinic: user.clinic, invoice });
  const clinicName = document.brandName || clinicDisplayName(user.clinic);
  const teeth = invoice.treatmentPlan?.selectedTeeth.length
    ? invoice.treatmentPlan.selectedTeeth.map((tooth) => tooth.toothNumber).join(", ")
    : invoice.treatmentPlan?.toothNumber;

  const backHref = fromPatient
    ? `/dashboard/patients/${fromPatient}${visit ? `?visit=${visit}` : ""}`
    : "/dashboard/billing";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={backHref} className="text-xs font-semibold text-primary hover:underline">
            ← {fromPatient ? "Back to the patient" : "Back to Money"}
          </Link>
          <h1 className="mt-1 text-[22px] leading-tight font-bold tabular-nums text-heading">
            {document.documentNumber}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {document.type.replaceAll("_", " ").toLowerCase()} for{" "}
            <Link
              href={`/dashboard/patients/${invoice.patientId}`}
              className="font-semibold text-primary hover:underline"
            >
              {document.patient.fullName}
            </Link>{" "}
            · raised{" "}
            <span title={exactStamp(invoice.issueDate)}>{humanTime(invoice.issueDate, now)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-pill px-3 py-1.5 text-[13px] font-semibold ${
              status === "Settled"
                ? "bg-success-bg text-success"
                : status === "Overdue"
                  ? "bg-danger-bg text-danger"
                  : "bg-warning-bg text-warning"
            }`}
          >
            {status === "Overdue" && late ? `Overdue, ${late}` : status}
          </span>
          <Link
            href={`/dashboard/billing/${invoice.id}/print`}
            target="_blank"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Print
          </Link>
          <SendInvoiceWhatsAppButton invoiceId={invoice.id} />
        </div>
      </header>

      <div className="grid items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
        <section className="overflow-hidden rounded-card border-2 border-heading bg-white p-4 text-heading sm:p-6">
          <div className="grid gap-5 border-b-2 border-heading pb-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <div className="text-left text-xs leading-relaxed font-semibold">
              <p className="font-bold">{clinicName.toUpperCase()}</p>
              <p>{document.type.replaceAll("_", " ")}</p>
            </div>
            <div className="flex items-center justify-start gap-3 text-left sm:justify-center sm:text-center">
              {document.logoUrl ? (
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-white p-1">
                  <Image
                    src={document.logoUrl}
                    alt=""
                    width={64}
                    height={64}
                    unoptimized
                    className="size-full object-contain"
                  />
                </div>
              ) : (
                <div className="grid size-14 place-items-center rounded-card bg-primary text-xl font-black text-white">
                  {clinicName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xl leading-none font-bold sm:text-2xl">{clinicName}</p>
                <p className="mt-1 text-[9px] font-semibold tracking-wide uppercase">
                  Patient care &amp; clinical services
                </p>
              </div>
            </div>
            <div className="text-left text-xs leading-relaxed font-medium sm:text-right">
              <p>{document.address || "Clinic address available on request"}</p>
              <p>{document.phone || document.email || ""}</p>
            </div>
          </div>

          <div className="grid items-center gap-2 border-b border-heading py-3 text-sm font-semibold sm:grid-cols-2">
            <p>
              No: <span className="ml-2 text-xl font-bold text-danger">{document.documentNumber}</span>
            </p>
            <p className="sm:text-right">
              Date: <span className="ml-2">{document.issuedAt.toLocaleDateString("en-IN")}</span>
            </p>
          </div>

          <div className="space-y-3 border-b border-heading py-3 text-sm">
            <p>
              Received with thanks from:{" "}
              <span className="ml-2 border-b border-heading px-1 font-semibold">
                {document.patient.fullName}
              </span>
            </p>
            <p>
              The sum of Rs.:{" "}
              <span className="ml-2 border-b border-heading px-1 font-semibold tabular-nums">
                {document.totalAmount.toLocaleString("en-IN")}
              </span>
            </p>
          </div>

          <div className="mt-3 overflow-hidden border border-heading text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] border-b border-heading bg-muted font-bold sm:grid-cols-[minmax(0,1fr)_33%]">
              <p className="px-3 py-2 text-base">TREATMENT</p>
              <p className="border-l border-heading px-3 py-2 text-right">Amount</p>
            </div>
            {(document.lineItems.length
              ? document.lineItems
              : [
                  {
                    id: 0,
                    description: "Dental treatment and clinical services",
                    lineTotal: document.totalAmount,
                    quantity: 1,
                  },
                ]
            ).map((item) => (
              <div
                key={item.id}
                className="grid min-h-8 grid-cols-[minmax(0,1fr)_7rem] border-b border-heading last:border-b-0 sm:grid-cols-[minmax(0,1fr)_33%]"
              >
                <p className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2">
                  <span className="font-semibold">{item.description}</span>
                  <span className="shrink-0 text-xs text-text-muted">x {item.quantity}</span>
                </p>
                <p className="border-l border-heading px-3 py-2 text-right tabular-nums">
                  Rs. {item.lineTotal.toLocaleString("en-IN")}
                </p>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] border-t border-heading font-bold sm:grid-cols-[minmax(0,1fr)_33%]">
              <p className="px-3 py-2 text-right">Total</p>
              <p className="border-l border-heading px-3 py-2 text-right tabular-nums">
                Rs. {document.totalAmount.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {invoice.treatmentPlan && (
            <p className="mt-2 text-xs">
              <span className="font-bold">Selected treatment:</span> {invoice.treatmentPlan.title}
              {teeth ? ` (Teeth: ${teeth})` : ""}
            </p>
          )}

          {document.notes && (
            <div className="mt-3 border-t border-heading pt-3 text-sm">
              <span className="font-bold">Notes: </span>
              <span className="whitespace-pre-wrap">{document.notes}</span>
            </div>
          )}
        </section>

        {visitNote && (
          <p className="text-[13px] text-text-muted">
            This bill belongs to a visit you wrote up.{" "}
            <Link
              href={`/dashboard/clinical-records/${visitNote.id}`}
              className="font-semibold text-primary hover:underline"
            >
              Open the clinical note
            </Link>
          </p>
        )}

        <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-4 pb-2.5">
            <h2 className="text-base font-semibold text-heading">Payments so far</h2>
            <span className="text-xs text-text-muted">
              {rupees(paid)} of {rupees(invoice.totalAmount)} collected
            </span>
          </div>
          {invoice.payments.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 border-t border-border px-4.5 pt-7 pb-9 text-center">
              <CreditCard className="h-6 w-6 text-text-muted" strokeWidth={1.7} aria-hidden />
              <p className="text-sm font-semibold text-heading">Nothing collected yet</p>
              <p className="text-[13px] text-text-muted">
                Take the payment on the right, or send {invoice.patient.fullName.split(" ")[0]} the
                invoice on WhatsApp so they can pay from home.
              </p>
            </div>
          ) : (
            invoice.payments.map((payment) => {
              const live = payment.status === "POSTED" && !payment.reversedAt;
              return (
                <div
                  key={payment.id}
                  className={`grid items-center gap-3 border-t border-border px-4.5 py-3 sm:grid-cols-[minmax(0,1fr)_140px] ${
                    live ? "border-l-[3px] border-l-primary" : "border-l-[3px] border-l-transparent"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-heading">
                      {payment.method}
                      {payment.receiptNumber ? (
                        <span className="ml-2 font-normal tabular-nums text-text-muted">
                          {payment.receiptNumber}
                        </span>
                      ) : null}
                    </p>
                    <p title={exactStamp(payment.paidAt)} className="text-xs text-text-muted">
                      {humanTime(payment.paidAt, now)}
                      {payment.recordedBy ? ` · ${payment.recordedBy}` : ""}
                      {payment.referenceNumber ? ` · ref ${payment.referenceNumber}` : ""}
                    </p>
                    {payment.reversalReason && (
                      <p className="text-xs font-semibold text-danger">
                        Put back: {payment.reversalReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        live ? "text-success" : "text-text-muted line-through"
                      }`}
                    >
                      {rupees(payment.amount)}
                    </span>
                    {live && can(user.role, "manageBilling") && (
                      <form action={reversePaymentAction} className="flex w-full flex-wrap gap-2">
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input
                          required
                          minLength={8}
                          name="reason"
                          placeholder="Why is it going back?"
                          aria-label={`Why the ${rupees(payment.amount)} payment is going back`}
                          className="h-10 min-w-0 flex-1 rounded-control border border-border bg-card px-2 text-xs"
                        />
                        <button className="h-10 cursor-pointer rounded-control border border-danger-border px-3 text-xs font-semibold text-danger hover:bg-danger-bg">
                          Put it back
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="px-4.5 pt-4 pb-2.5">
            <h2 className="text-base font-semibold text-heading">History</h2>
            <p className="mt-1 text-[13px] text-text-muted">
              Everything that happened to this invoice, newest first.
            </p>
          </div>
          {trail.length === 0 ? (
            <p className="border-t border-border px-4.5 py-6 text-center text-[13px] text-text-muted">
              Nothing logged against this invoice yet.
            </p>
          ) : (
            trail.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 border-t border-border px-4.5 py-2.5"
              >
                <span
                  className={`mt-1.5 h-2 w-2 rounded-pill ${EVENT_DOT[entry.action] ?? "bg-primary"}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground">
                    {entry.detail || humanLabel(entry.action)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {entry.user?.fullName ?? "Automatic"}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </p>
                </div>
                <span
                  title={exactStamp(entry.createdAt)}
                  className="text-right text-xs whitespace-nowrap text-text-muted"
                >
                  {humanTime(entry.createdAt, now)}
                </span>
              </div>
            ))
          )}
        </section>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                Still owing
              </p>
              <p
                className={`text-2xl font-bold tabular-nums ${outstanding > 0 ? "text-danger" : "text-success"}`}
              >
                {outstanding > 0 ? rupees(outstanding) : "Nothing"}
              </p>
              <p className="text-xs text-text-muted">
                {rupees(paid)} paid of {rupees(invoice.totalAmount)}
                {invoice.dueDate ? ` · due ${humanTime(invoice.dueDate, now)}` : ""}
              </p>
            </div>

            {acceptsPayments ? (
              <CollectRow
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoiceNumber}
                patientName={invoice.patient.fullName}
                due={outstanding}
                total={invoice.totalAmount}
                paid={paid}
                canVoid={can(user.role, "manageBilling")}
              />
            ) : (
              <p className="rounded-control border border-warning-border bg-warning-bg p-3 text-[13px] text-warning">
                This is an estimate, so it cannot take a payment. Raise a tax or non-tax invoice first.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <p className="text-[13px] font-semibold text-heading">
              {invoice.patient.fullName.split(" ")[0]}&rsquo;s account
            </p>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-text-muted">Owes across all bills</span>
              <span
                className={`font-semibold tabular-nums ${lifetimeBalance > 0 ? "text-danger" : "text-success"}`}
              >
                {rupees(lifetimeBalance)}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-text-muted">Paid with you so far</span>
              <span className="font-semibold tabular-nums text-heading">{rupees(lifetimePaid)}</span>
            </div>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-text-muted">Plans not yet billed</span>
              <span className="font-semibold tabular-nums text-heading">
                {rupees(plansPending._sum.estimatedCost ?? 0)}
              </span>
            </div>
            <Link
              href={`/dashboard/patients/${invoice.patientId}?tab=Money`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Open {invoice.patient.fullName.split(" ")[0]}&rsquo;s file
            </Link>
          </div>

          {can(user.role, "manageBilling") && (
            <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
              <p className="text-[13px] font-semibold text-heading">Corrections</p>
              <p className="text-xs text-text-muted">
                A raised invoice cannot be edited — the number and the amount are what the patient was
                given. Void it and raise a new one instead. Voiding cannot be undone.
              </p>
              <Link
                href={`/dashboard/billing/new?patientId=${invoice.patientId}`}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
              >
                Raise a replacement
              </Link>
            </div>
          )}

        </aside>
      </div>
    </div>
  );
}
