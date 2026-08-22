export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/documents/B6ClinicalDocuments";
import { PrintActions } from "@/components/documents/PrintActions";
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
  return (
    <main className="min-h-screen bg-background px-3 py-6 text-heading print:bg-white print:p-0">
      <PrintActions backHref={`/dashboard/billing/${invoice.id}`} backLabel="Back to invoice" />
      <InvoiceDocument document={document} />
    </main>
  );
}
