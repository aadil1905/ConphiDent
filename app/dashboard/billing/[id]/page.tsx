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
import BackLink from "@/components/navigation/BackLink";

/** What a refused reversal actually means, in the words of the thing refused. */
const REFUSALS: Record<string, string> = {
  reason: "Nothing was reversed. The reason has to say what happened — a few words at least, because it is what the audit trail will carry.",
  gone: "Nothing was reversed. That payment had already been reversed, or the invoice has since been voided. Reload to see where it stands.",
};

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
  searchParams: Promise<{ fromPatient?: string; visit?: string; error?: string }>;
}) {
  const user = await requireFeature("billing");
  const { id } = await params;
  const { fromPatient, visit, error } = await searchParams;
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
  const [trail, patientInvoices, plansPending] = await Promise.all([
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
    // No inner width cap: the shell already limits content, and a second
    // max-w-* just strands empty margins either side of the document.
    <div className="flex w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackLink fallback={backHref} className="text-xs font-semibold text-primary hover:underline">
            ← {fromPatient ? "Back to the patient" : "Back to Money"}
          </BackLink>
          <h1 className="mt-1 text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading tabular-nums">
            {document.documentNumber}
          </h1>
          <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
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

      {REFUSALS[error ?? ""] && (
        <p
          role="alert"
          className="rounded-control border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger"
        >
          {REFUSALS[error ?? ""]}
        </p>
      )}

      <div className="grid items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
        {/* The document itself, styled like the paper it becomes: a letterhead,
            a ruled meta band, a hairline items table and a totals column. The
            old carbon-receipt framing ("Received with thanks from", inked
            blanks, a red number) read as a shop bill, not a clinic's invoice. */}
        <section className="overflow-hidden rounded-card border border-border bg-card text-heading shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-5 p-6 pb-5 sm:p-8 sm:pb-6">
            <div className="flex min-w-0 items-center gap-4">
              {document.logoUrl ? (
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-[var(--logo-plate)] p-1">
                  <Image
                    src={document.logoUrl}
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="size-full object-contain"
                  />
                </div>
              ) : (
                <div className="grid size-12 shrink-0 place-items-center rounded-card bg-heading font-[family-name:var(--font-display)] text-xl font-semibold text-white">
                  {clinicName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-display)] text-[22px] leading-tight font-semibold">
                  {clinicName}
                </p>
                {document.legalName && document.legalName !== clinicName && (
                  <p className="mt-0.5 text-[11px] text-text-muted">{document.legalName}</p>
                )}
              </div>
            </div>
            <div className="min-w-0 text-left text-[11.5px] leading-relaxed text-text-muted sm:text-right">
              <p className="max-w-[34ch]">{document.address || "Clinic address available on request"}</p>
              <p>{[document.phone, document.email].filter(Boolean).join(" · ")}</p>
              {document.gstin && <p>GSTIN {document.gstin}</p>}
              {document.registrationNumber && <p>Reg. {document.registrationNumber}</p>}
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-3 border-y border-border bg-muted/60 px-6 py-4 sm:grid-cols-4 sm:px-8">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--gold)] uppercase">
                {document.type.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">{document.documentNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-text-muted uppercase">Billed to</p>
              <p className="mt-1 text-[14px] font-semibold">{document.patient.fullName}</p>
              {document.patient.phone && (
                <p className="text-[11.5px] text-text-muted tabular-nums">{document.patient.phone}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-text-muted uppercase">Issued</p>
              <p className="mt-1 text-[14px] font-semibold tabular-nums">
                {document.issuedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-text-muted uppercase">
                {document.outstandingAmount > 0 ? "Balance due" : "Status"}
              </p>
              <p className={`mt-1 text-[14px] font-semibold tabular-nums ${document.outstandingAmount > 0 ? "text-danger" : "text-success"}`}>
                {document.outstandingAmount > 0
                  ? `₹${document.outstandingAmount.toLocaleString("en-IN")}`
                  : "Paid in full"}
              </p>
            </div>
          </div>

          <div className="px-6 pt-5 sm:px-8">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border-strong text-left text-[10.5px] font-semibold tracking-[0.1em] text-text-muted uppercase">
                  <th className="pb-2.5 font-semibold">Treatment</th>
                  <th className="w-14 pb-2.5 text-right font-semibold">Qty</th>
                  <th className="w-28 pb-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
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
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-3 pr-4 font-medium">{item.description}</td>
                    <td className="py-3 text-right text-text-muted tabular-nums">{item.quantity}</td>
                    <td className="py-3 text-right font-semibold tabular-nums">
                      ₹{item.lineTotal.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto mt-4 w-full max-w-[18rem] text-[13.5px]">
              {document.discountAmount > 0 && (
                <>
                  <div className="flex justify-between py-1 text-text-muted">
                    <span>Subtotal</span>
                    <span className="tabular-nums">₹{document.subtotalAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between py-1 text-text-muted">
                    <span>Discount</span>
                    <span className="tabular-nums">−₹{document.discountAmount.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}
              {document.taxAmount > 0 && (
                <div className="flex justify-between py-1 text-text-muted">
                  <span>GST</span>
                  <span className="tabular-nums">₹{document.taxAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-heading pt-2.5">
                <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold">Total</span>
                <span className="font-[family-name:var(--font-display)] text-[20px] font-semibold tabular-nums">
                  ₹{document.totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
              {document.paidAmount > 0 && (
                <div className="flex justify-between py-1 text-[12.5px] text-success">
                  <span>Received so far</span>
                  <span className="tabular-nums">₹{document.paidAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5 px-6 pt-4 pb-6 text-[12px] leading-relaxed text-text-muted sm:px-8">
            {invoice.treatmentPlan && (
              <p>
                <span className="font-semibold text-heading">Treatment plan:</span>{" "}
                {invoice.treatmentPlan.title}
                {teeth ? ` (teeth ${teeth})` : ""}
              </p>
            )}
            {document.notes && (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-heading">Notes:</span> {document.notes}
              </p>
            )}
            {document.paymentDetails && (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-heading">How to pay:</span> {document.paymentDetails}
              </p>
            )}
            <p className="border-t border-border pt-3 text-[11px]">
              {document.footer || `Thank you for trusting ${clinicName} with your care.`}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-2.5">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Payments so far</h2>
            <span className="text-xs text-text-muted">
              {rupees(paid)} of {rupees(invoice.totalAmount)} collected
            </span>
          </div>
          {invoice.payments.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 border-t border-border px-5.5 pt-7 pb-9 text-center">
              <CreditCard className="h-6 w-6 text-text-muted" strokeWidth={1.7} aria-hidden />
              <p className="text-sm font-semibold text-heading">Nothing collected yet</p>
              <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
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
                  className={`grid items-center gap-3 border-t border-border px-5.5 py-3 sm:grid-cols-[minmax(0,1fr)_140px] ${
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
                      <form
                        action={reversePaymentAction}
                        data-confirmation-managed="true"
                        className="flex w-full flex-wrap gap-2"
                      >
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        {/* Stamped here rather than by the global confirmation
                            helper: this form asks its own question, and the
                            action must not depend on a DOM observer running. */}
                        <input type="hidden" name="confirmed" value="1" />
                        <input
                          required
                          minLength={8}
                          name="reversalReason"
                          placeholder="Why is it going back?"
                          aria-label={`Why the ${rupees(payment.amount)} payment is going back`}
                          className="h-11 min-w-0 flex-1 rounded-control border border-border bg-card px-2 text-xs"
                        />
                        <button className="h-11 cursor-pointer rounded-control border border-danger-border px-3 text-xs font-semibold text-danger hover:bg-danger-bg">
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
          <div className="px-5.5 pt-4 pb-2.5">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">History</h2>
            <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              Everything that happened to this invoice, newest first.
            </p>
          </div>
          {trail.length === 0 ? (
            <p className="border-t border-border px-5.5 py-6 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              Nothing logged against this invoice yet.
            </p>
          ) : (
            trail.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-3 border-t border-border px-5.5 py-2.5"
              >
                <span
                  className={`mt-1.5 h-2 w-2 rounded-pill ${EVENT_DOT[entry.action] ?? "bg-primary"}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
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

        <aside className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">
                Still owing
              </p>
              <p
                className={`text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums ${outstanding > 0 ? "text-danger" : "text-success"}`}
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
              <p className="rounded-control border border-warning-border bg-warning-bg p-3 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-warning">
                This is an estimate, so it cannot take a payment. Raise a tax or non-tax invoice first.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">
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
              <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">Corrections</p>
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
