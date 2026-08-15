export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { normalizeInvoicePrefix } from "@/lib/invoice-number";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/lists/PageHeader";
import { updateBillingIdentityAction } from "../actions";

function Field({
  label,
  name,
  hint,
  defaultValue,
  maxLength,
  required = false,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultValue: string | null;
  maxLength: number;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-heading">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        maxLength={maxLength}
        required={required}
        className="min-h-11 rounded-control border border-border bg-white px-3 text-sm text-foreground"
      />
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

export default async function BillingIdentityPage() {
  const user = await requireFeature("billing");
  const clinic = await prisma.clinic.findUnique({
    where: { id: user.clinicId },
    select: {
      name: true,
      brandName: true,
      gstin: true,
      registrationNumber: true,
      invoicePrefix: true,
      receiptPrefix: true,
      invoiceFooter: true,
      paymentDetails: true,
    },
  });
  if (!clinic) return null;

  const previewPrefix = normalizeInvoicePrefix(clinic.invoicePrefix);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader
        title="Billing identity"
        sub="What patients see on every invoice and receipt you raise from now on."
        actions={
          <Link
            href="/dashboard/billing"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Money
          </Link>
        }
      />

      <div className="rounded-card border border-border bg-muted p-4">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
          Name on the document
        </p>
        <p className="text-lg font-bold text-heading">{clinic.brandName || clinic.name}</p>
        <p className="mt-1 text-xs text-text-muted">
          The name and logo come from the clinic profile. Anything already finalised keeps the wording it
          was raised with, even after you change this.
        </p>
      </div>

      <form
        action={updateBillingIdentityAction}
        className="flex flex-col gap-4 rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" name="gstin" defaultValue={clinic.gstin} maxLength={20} />
          <Field
            label="Registration number"
            name="registrationNumber"
            defaultValue={clinic.registrationNumber}
            maxLength={100}
          />
          <Field
            label="Invoice prefix"
            name="invoicePrefix"
            hint="Goes in front of every invoice number."
            defaultValue={clinic.invoicePrefix || "INV"}
            maxLength={12}
            required
          />
          <Field
            label="Receipt prefix"
            name="receiptPrefix"
            hint="Goes in front of every receipt number."
            defaultValue={clinic.receiptPrefix || "RCT"}
            maxLength={12}
            required
          />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">How patients can pay you</span>
          <textarea
            name="paymentDetails"
            defaultValue={clinic.paymentDetails ?? ""}
            maxLength={1500}
            rows={4}
            placeholder="UPI ID, bank account, a payment link, or how to hand over cash"
            className="rounded-control border border-border bg-white px-3 py-2.5 text-sm text-foreground"
          />
          <span className="text-xs text-text-muted">Printed at the bottom of every invoice.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">Footer and terms</span>
          <textarea
            name="invoiceFooter"
            defaultValue={clinic.invoiceFooter ?? ""}
            maxLength={500}
            rows={3}
            placeholder="A thank-you line, when payment is due, or your cancellation terms"
            className="rounded-control border border-border bg-white px-3 py-2.5 text-sm text-foreground"
          />
        </label>

        <div className="rounded-control border border-border bg-muted p-3.5">
          <p className="text-xs font-semibold text-heading">The next number will look like this</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-primary">
            {previewPrefix}-000001
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Numbers are handed out one at a time as documents are raised, so two people billing at once
            never get the same one.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5">
          <button className="min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
