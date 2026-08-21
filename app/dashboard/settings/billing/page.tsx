export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { latestInvoiceNumber, normalizeInvoicePrefix, nextInvoiceNumber } from "@/lib/invoice-number";
import { prisma } from "@/lib/prisma";
import WorkPage from "@/components/lists/WorkPage";
import PrintButton from "@/components/dashboard/PrintButton";
import BillingIdentity from "@/components/billing/BillingIdentity";

export default async function BillingIdentityPage() {
  const user = await requireFeature("billing");
  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: {
      name: true,
      brandName: true,
      phone: true,
      address: true,
      gstin: true,
      registrationNumber: true,
      invoicePrefix: true,
      receiptPrefix: true,
      invoiceFooter: true,
      paymentDetails: true,
    },
  });
  if (!clinic) return null;

  const invoicePrefix = normalizeInvoicePrefix(clinic.invoicePrefix);
  const raised = await prisma.invoice.findMany({
    where: { clinicId: user.clinicId, invoiceNumber: { startsWith: `${invoicePrefix}-` } },
    select: { invoiceNumber: true },
  });
  // The real next number, not a placeholder — this screen is where people come
  // to check what the next bill will say.
  const numbers = raised.map((invoice) => invoice.invoiceNumber);
  const nextUnderSavedPrefix = nextInvoiceNumber(invoicePrefix, numbers);
  const lastRaised = latestInvoiceNumber(invoicePrefix, numbers);

  const saved = {
    gstin: clinic.gstin ?? "",
    registrationNumber: clinic.registrationNumber ?? "",
    invoicePrefix: clinic.invoicePrefix || "INV",
    receiptPrefix: clinic.receiptPrefix || "RCT",
    invoiceFooter: clinic.invoiceFooter ?? "",
    paymentDetails: clinic.paymentDetails ?? "",
  };

  return (
    <WorkPage
      title="How your bills look"
      sub="Everything on this page prints on the invoices and receipts you raise from now on."
      actions={
        <>
          <PrintButton label="Print a test bill" tone="outline" />
          <Link
            href="/dashboard/billing"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            Back to Money
          </Link>
        </>
      }
    >
      <BillingIdentity
        // Re-seed the editor from what is stored the moment a save lands.
        key={JSON.stringify(saved)}
        saved={saved}
        clinicName={clinic.brandName || clinic.name}
        clinicAddress={clinic.address ?? ""}
        clinicPhone={clinic.phone ?? ""}
        nextUnderSavedPrefix={nextUnderSavedPrefix}
        lastRaised={lastRaised}
        canEditProfile={user.role === "OWNER"}
      />
    </WorkPage>
  );
}
