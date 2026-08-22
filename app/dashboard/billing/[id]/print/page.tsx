export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/documents/B6ClinicalDocuments";
import { InvoiceScreen, ScreenHeader, ScreenSheet } from "@/components/documents/DocumentScreenView";
import PrintDocumentButton from "@/components/documents/PrintDocumentButton";
import { requireFeature } from "@/lib/features";
import { buildInvoiceDocument } from "@/lib/billing-document";
import { loadClinicDocumentBrand } from "@/lib/clinic-document";
import { prisma } from "@/lib/prisma";

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeature("billing");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [invoice, clinic] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, clinicId: user.clinicId, voidedAt: null },
      include: {
        patient: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { where: { status: "POSTED" }, orderBy: { paidAt: "asc" } },
      },
    }),
    loadClinicDocumentBrand(user.clinicId),
  ]);
  if (!invoice || !clinic) notFound();

  const document = buildInvoiceDocument({ clinic, invoice });
  // Sentence-cased for the screen; the sheet sets the same string in caps. Both
  // read documentTitle so a clinic without a GSTIN is a plain "Invoice" on both.
  const title = document.documentTitle.toLowerCase().replace(/^./, (c) => c.toUpperCase());

  return (
    <>
      <ScreenSheet>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/dashboard/billing/${invoice.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            ← Back to the invoice
          </Link>
          <PrintDocumentButton label="Print / Save PDF" />
        </div>
        <ScreenHeader
          eyebrow={title}
          title={document.patient.fullName}
          meta={[document.documentNumber, document.patient.phone, `Issued ${document.issuedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`]}
          aside={
            <>
              <p className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">{document.outstandingAmount > 0 ? "Balance due" : "Settled"}</p>
              <p className="mt-1 text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums text-heading">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(document.outstandingAmount > 0 ? document.outstandingAmount : document.totalAmount)}
              </p>
            </>
          }
        />
        <InvoiceScreen document={document} />
      </ScreenSheet>

      {/* Paper only. Hidden on screen, laid out for the printer. */}
      <div className="hidden print:block">
        <InvoiceDocument document={document} />
      </div>
    </>
  );
}
