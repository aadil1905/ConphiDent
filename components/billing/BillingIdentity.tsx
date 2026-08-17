"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import { updateBillingIdentityAction } from "@/app/dashboard/settings/actions";

export type BillingIdentityFields = {
  gstin: string;
  registrationNumber: string;
  invoicePrefix: string;
  receiptPrefix: string;
  invoiceFooter: string;
  paymentDetails: string;
};

const FIELD_NAMES: Record<keyof BillingIdentityFields, string> = {
  gstin: "GSTIN",
  registrationNumber: "registration number",
  invoicePrefix: "invoice prefix",
  receiptPrefix: "receipt prefix",
  invoiceFooter: "footer wording",
  paymentDetails: "how patients can pay",
};

const FOOTER_LIMIT = 500;
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

const card = "rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]";
const input = "min-h-11 rounded-control border border-border bg-card px-3 text-sm text-foreground";
const badInput = "min-h-11 rounded-control border border-danger-border bg-card px-3 text-sm text-foreground";

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className={`${card} print:hidden`}>
      <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
      <p className="mt-0.5 mb-3.5 text-xs text-text-muted">{sub}</p>
      {children}
    </section>
  );
}

/**
 * What prints on a bill is hard to check after the fact, so this shows the bill
 * as you type and will not save a GSTIN or prefix that would print wrong.
 */
export default function BillingIdentity({
  saved,
  clinicName,
  clinicAddress,
  clinicPhone,
  nextUnderSavedPrefix,
  lastRaised,
  canEditProfile,
}: {
  saved: BillingIdentityFields;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  /** What the next bill is numbered while the saved prefix is still in force. */
  nextUnderSavedPrefix: string;
  lastRaised: string | null;
  canEditProfile: boolean;
}) {
  const [form, setForm] = useState(saved);
  const [state, submit, pending] = useActionState(updateBillingIdentityAction, { ok: true, message: "" });

  const set = <K extends keyof BillingIdentityFields>(key: K, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  // A successful write remounts this component from the page (see its `key`),
  // so the edits are re-seeded from the new saved values rather than patched.
  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const edited = (Object.keys(FIELD_NAMES) as Array<keyof BillingIdentityFields>).filter(
    (key) => form[key].trim() !== saved[key].trim(),
  );

  const prefix = form.invoicePrefix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const prefixOk = prefix.length >= 2;
  const prefixChanged = prefix !== saved.invoicePrefix.trim().toUpperCase();
  const gstin = form.gstin.replace(/\s/g, "").toUpperCase();
  const gstinOk = gstin === "" || GSTIN_PATTERN.test(gstin);
  // A new prefix starts its own run, because numbers are handed out per prefix.
  const sampleNumber = prefixChanged ? `${prefix || "INV"}-000001` : nextUnderSavedPrefix;
  const canSave = edited.length > 0 && prefixOk && gstinOk;

  return (
    <form action={submit} className="flex flex-col gap-6">
      <Card
        title="The clinic, as patients see it"
        sub="This is the name and address printed at the top of every bill and receipt."
      >
        <div className="rounded-control border border-border bg-muted p-3.5">
          <p className="text-sm font-semibold text-heading">{clinicName}</p>
          <p className="text-xs whitespace-pre-line text-text-muted">{clinicAddress || "No address set"}</p>
          <p className="text-xs text-text-muted">{clinicPhone || "No phone set"}</p>
          <p className="mt-2 text-xs text-text-muted">
            The name, address and phone live on the clinic profile, where only an owner can change
            them.{" "}
            {canEditProfile && (
              <Link href="/dashboard/settings" className="font-semibold text-primary hover:underline">
                Edit the profile
              </Link>
            )}
          </p>
        </div>

        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">Dental council registration</span>
          <input
            name="registrationNumber"
            value={form.registrationNumber}
            onChange={(event) => set("registrationNumber", event.target.value)}
            maxLength={100}
            placeholder="MSDC/A-12894"
            className={input}
          />
          <span className="text-xs text-text-muted">
            Printed under the clinic name — patients and insurers ask for it.
          </span>
        </label>
      </Card>

      <Card
        title="Document numbers"
        sub="Numbers never repeat and never go backwards, so your books stay auditable."
      >
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Invoice prefix</span>
            <input
              name="invoicePrefix"
              value={form.invoicePrefix}
              onChange={(event) => set("invoicePrefix", event.target.value.toUpperCase())}
              maxLength={12}
              required
              aria-invalid={!prefixOk}
              className={prefixOk ? input : badInput}
            />
            <span className={`text-xs ${prefixOk ? "text-text-muted" : "text-danger"}`}>
              {prefixOk
                ? "Two to twelve letters or numbers — it sits before the number."
                : "Use at least two letters or numbers, like INV or SCDS."}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Receipt prefix</span>
            <input
              name="receiptPrefix"
              value={form.receiptPrefix}
              onChange={(event) => set("receiptPrefix", event.target.value.toUpperCase())}
              maxLength={12}
              required
              className={input}
            />
            <span className="text-xs text-text-muted">Goes in front of every receipt number.</span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Your next bill will read</span>
            <div className="flex min-h-11 items-center rounded-control border border-dashed border-border-strong bg-muted px-3 text-[15px] font-bold tabular-nums text-heading">
              {sampleNumber}
            </div>
            <span className="text-xs text-text-muted">
              {prefixChanged
                ? "A new prefix starts its own run at 000001."
                : lastRaised
                  ? `Last bill raised was ${lastRaised}.`
                  : "No bills raised yet."}
            </span>
          </div>
        </div>
      </Card>

      <Card
        title="Tax"
        sub="Dental treatment is GST-exempt in India. Fill this in only if you also sell things like whitening kits or brushes."
      >
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">GSTIN</span>
          <input
            name="gstin"
            value={form.gstin}
            onChange={(event) => set("gstin", event.target.value.toUpperCase())}
            maxLength={20}
            placeholder="27AABCU9603R1ZX"
            aria-invalid={!gstinOk}
            className={gstinOk ? input : badInput}
          />
          <span className={`text-xs ${gstinOk ? "text-text-muted" : "text-danger"}`}>
            {gstinOk
              ? "15 characters, exactly as on your registration certificate. Leave it empty if you do not charge GST."
              : "That GSTIN is not 15 characters yet — copy it from your certificate."}
          </span>
        </label>
      </Card>

      <Card
        title="How patients can pay you"
        sub="Whatever you write here appears at the bottom of the bill and in the payment link you send on WhatsApp."
      >
        <textarea
          name="paymentDetails"
          value={form.paymentDetails}
          onChange={(event) => set("paymentDetails", event.target.value)}
          maxLength={1500}
          rows={4}
          placeholder="UPI ID, bank account, a payment link, or how to hand over cash"
          className="w-full rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground"
        />
      </Card>

      <Card
        title="Wording at the bottom of the bill"
        sub="Keep it short. Patients read this while they are paying."
      >
        <textarea
          name="invoiceFooter"
          value={form.invoiceFooter}
          onChange={(event) => set("invoiceFooter", event.target.value)}
          maxLength={FOOTER_LIMIT}
          rows={3}
          placeholder="A thank-you line, when payment is due, or your cancellation terms"
          className="w-full rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground"
        />
        <p className="mt-1.5 text-xs text-text-muted">
          {form.invoiceFooter.length} of {FOOTER_LIMIT} characters
        </p>
      </Card>

      <section className={card}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase print:hidden">
          Live preview
        </p>
        <div className="mt-2 max-w-[125mm] rounded-control border border-border p-4">
          <p className="text-sm font-bold text-heading">{clinicName}</p>
          <p className="text-[11px] whitespace-pre-line text-text-muted">{clinicAddress}</p>
          <p className="text-[11px] text-text-muted">
            {clinicPhone}
            {form.registrationNumber.trim() && ` · Reg. ${form.registrationNumber.trim()}`}
          </p>

          <div className="mt-2.5 flex justify-between gap-2 border-y border-border py-1.5 text-[11px] text-text-muted">
            <span className="font-semibold tabular-nums text-heading">{sampleNumber}</span>
            <span>A bill raised today</span>
          </div>

          <div className="mt-2.5 text-[11px] text-foreground">
            <div className="flex justify-between gap-2">
              <span>Root canal treatment · 36</span>
              <span className="tabular-nums">{rupees(9000)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span>Zirconia crown · 36</span>
              <span className="tabular-nums">{rupees(8000)}</span>
            </div>
            {gstin && gstinOk && (
              <div className="flex justify-between gap-2 text-text-muted">
                <span>GST on products</span>
                <span className="tabular-nums">{rupees(0)}</span>
              </div>
            )}
          </div>

          <div className="mt-1.5 flex justify-between gap-2 border-t border-border pt-1.5 text-[13px] font-bold text-heading">
            <span>Total</span>
            <span className="tabular-nums">{rupees(17000)}</span>
          </div>

          {gstin && gstinOk && <p className="mt-2 text-[10px] text-text-muted">GSTIN {gstin}</p>}
          {form.paymentDetails.trim() && (
            <p className="mt-1 text-[10px] whitespace-pre-line text-text-muted">
              {form.paymentDetails.trim()}
            </p>
          )}
          {form.invoiceFooter.trim() && (
            <p className="mt-1 text-[10px] italic text-text-muted">{form.invoiceFooter.trim()}</p>
          )}
        </div>
        <p className="mt-2 text-xs text-text-muted print:hidden">
          Updates as you type. Nothing reaches a patient until you save, and bills already raised keep
          the wording they were printed with.
        </p>
      </section>

      <section className={`${card} flex flex-col gap-2.5 print:hidden`}>
        <h2 className="text-[13px] font-semibold text-heading">
          {edited.length ? "About to change" : "No pending changes"}
        </h2>
        {edited.length ? (
          <ul className="flex flex-col gap-0.5 text-xs text-foreground">
            {edited.map((key) => (
              <li key={key}>You edited the {FIELD_NAMES[key]}.</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-text-muted">Nothing edited yet.</p>
        )}
        <div className="flex flex-wrap gap-2.5">
          <button
            type="submit"
            disabled={!canSave || pending}
            className="min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-muted disabled:text-text-muted"
          >
            {pending
              ? "Saving…"
              : canSave
                ? "Save — new bills use this"
                : edited.length
                  ? "Fix the highlighted fields"
                  : "Nothing to save"}
          </button>
          <button
            type="button"
            onClick={() => setForm(saved)}
            disabled={!edited.length}
            className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard my edits
          </button>
        </div>
      </section>
    </form>
  );
}
