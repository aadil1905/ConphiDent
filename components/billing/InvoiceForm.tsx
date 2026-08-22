"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Pending from "@/components/ui/pending";
import { useUnsavedGuard } from "@/components/ui/unsaved-guard";

type AppointmentVisit = { id: number; appointmentDate: string | Date; appointmentTime: string; treatment: string; status: string };
type Patient = { id: number; fullName: string; phone: string; appointments?: AppointmentVisit[] };
type Plan = { id: number; title: string; patientId: number; visitDate?: string | Date | null; items: Array<{ name: string; price: number }> };
type LineItem = { description: string; quantity: number; unitPrice: number; discount: number; taxPercent: number };

/**
 * Four kinds of document, named for what the patient is being handed rather
 * than for the row in the database.
 */
const DOCUMENT_TYPES = [
  { value: "TAX_INVOICE", label: "Bill with GST", note: "A tax invoice" },
  { value: "NON_TAX_INVOICE", label: "Bill", note: "No GST on it" },
  { value: "ESTIMATE", label: "Estimate", note: "What it might come to" },
  { value: "QUOTATION", label: "Quote", note: "A price you are holding" },
] as const;

const field =
  "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground outline-none";
const label = "flex flex-col gap-1.5 text-xs font-semibold text-heading";

const blankLine = (): LineItem => ({ description: "", quantity: 1, unitPrice: 0, discount: 0, taxPercent: 0 });
const money = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

function dateKey(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}
const todayKey = () => dateKey(new Date());

function formatVisit(appointment: AppointmentVisit) {
  return `${new Date(appointment.appointmentDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })} · ${appointment.appointmentTime} · ${appointment.treatment}`;
}

/** What one line comes to, discount applied, tax only on a tax invoice. */
function lineTotal(line: LineItem, taxable: boolean) {
  const base = Math.max(0, line.quantity * line.unitPrice);
  const afterDiscount = base - Math.min(base, Math.max(0, line.discount));
  return afterDiscount + (taxable ? Math.round((afterDiscount * Math.max(0, line.taxPercent)) / 100) : 0);
}

export default function InvoiceForm({
  patients,
  plans,
  initialPatientId,
  initialVisit,
  invoiceNumberPreview,
  fromPatient,
}: {
  patients: Patient[];
  plans: Plan[];
  initialPatientId?: number;
  initialVisit?: string;
  invoiceNumberPreview: string;
  fromPatient?: boolean;
}) {
  const router = useRouter();
  const { formRef: unsavedFormRef, release: releaseUnsaved, dialog: unsavedDialog } = useUnsavedGuard();
  const [saving, setSaving] = useState(false);
  const [patientId, setPatientId] = useState(initialPatientId ? String(initialPatientId) : "");
  const [planId, setPlanId] = useState("");
  const [documentType, setDocumentType] = useState<string>("TAX_INVOICE");
  const [lines, setLines] = useState<LineItem[]>([blankLine()]);
  // The things most bills never need, folded away until they do.
  const [showExtras, setShowExtras] = useState(false);
  const [takingPayment, setTakingPayment] = useState(false);

  const taxable = documentType === "TAX_INVOICE";
  const isBill = documentType.includes("INVOICE");
  const patient = useMemo(() => patients.find((entry) => entry.id === Number(patientId)), [patientId, patients]);
  const visits = patient?.appointments ?? [];
  const availablePlans = plans.filter((plan) => !patientId || plan.patientId === Number(patientId));

  const totals = useMemo(
    () =>
      lines.reduce(
        (running, line) => {
          const base = Math.max(0, line.quantity * line.unitPrice);
          const discount = Math.min(base, Math.max(0, line.discount));
          const afterDiscount = base - discount;
          const tax = taxable ? Math.round((afterDiscount * Math.max(0, line.taxPercent)) / 100) : 0;
          return {
            subtotal: running.subtotal + base,
            discount: running.discount + discount,
            tax: running.tax + tax,
            total: running.total + afterDiscount + tax,
          };
        },
        { subtotal: 0, discount: 0, tax: 0, total: 0 },
      ),
    [taxable, lines],
  );

  const canSave =
    Boolean(patientId) &&
    totals.total > 0 &&
    lines.every((line) => line.description.trim() && line.quantity > 0 && line.unitPrice >= 0) &&
    !saving;

  function updateLine(index: number, key: keyof LineItem, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, [key]: key === "description" ? value : Math.max(0, Math.trunc(Number(value) || 0)) }
          : line,
      ),
    );
  }

  function selectPlan(value: string) {
    setPlanId(value);
    const plan = availablePlans.find((entry) => entry.id === Number(value));
    if (plan?.items.length) {
      setLines(plan.items.map((item) => ({ description: item.name, quantity: 1, unitPrice: item.price, discount: 0, taxPercent: 0 })));
      toast.success(`${plan.items.length} treatments brought across from the plan.`);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      toast.error("Pick a patient and give every line a description and a price.");
      return;
    }
    setSaving(true);
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, documentType, lineItems: lines, totalAmount: totals.total, discountAmount: totals.discount }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not save.");

      releaseUnsaved();
      toast.success(`${body.invoiceNumber} raised for ${money(totals.total)}.`);
      const context = fromPatient
        ? `?fromPatient=${body.patientId}${payload.issueDate ? `&visit=${encodeURIComponent(String(payload.issueDate))}` : ""}`
        : "";
      router.push(`/dashboard/billing/${body.id}${context}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not save — nothing was lost, try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={unsavedFormRef} onSubmit={submit} className="flex flex-col gap-6">
      {unsavedDialog}
      {/* --- 1. What kind of document ------------------------------------- */}
      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">What are you giving them?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {DOCUMENT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setDocumentType(type.value)}
              aria-pressed={documentType === type.value}
              className={`flex min-h-[3.6rem] cursor-pointer flex-col items-start justify-center rounded-control border px-4 text-left ${
                documentType === type.value
                  ? "border-primary bg-primary-soft text-heading"
                  : "border-border-strong bg-card text-heading hover:bg-muted"
              }`}
            >
              <span className="text-sm font-semibold">{type.label}</span>
              <span className="text-xs font-normal text-text-muted">{type.note}</span>
            </button>
          ))}
        </div>
      </section>

      {/* --- 2. Who and which visit --------------------------------------- */}
      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Who is it for?</h2>
        <div className="mt-3 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
          <label className={label}>
            Patient<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <select
              required
              name="patientId"
              value={patientId}
              onChange={(event) => {
                setPatientId(event.target.value);
                setPlanId("");
              }}
              className={field}
            >
              <option value="">Pick a patient</option>
              {patients.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.fullName} · {entry.phone}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            Which visit<span aria-hidden className="font-normal text-danger-mark"> *</span>
            <select required name="issueDate" defaultValue={initialVisit || todayKey()} className={field}>
              <option value={todayKey()}>Today</option>
              {visits.map((visit) => (
                <option key={visit.id} value={dateKey(visit.appointmentDate)}>
                  {formatVisit(visit)}
                </option>
              ))}
            </select>
          </label>

          {availablePlans.length > 0 && (
            <label className={label}>
              Bring the lines from a plan
              <select name="treatmentPlanId" value={planId} onChange={(event) => selectPlan(event.target.value)} className={field}>
                <option value="">Type them myself</option>
                {availablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {/* --- 3. The work -------------------------------------------------- */}
      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">What are you charging for?</h2>
          <button
            type="button"
            onClick={() => setLines((current) => [...current, blankLine()])}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add a line
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          {lines.map((line, index) => (
            <div
              key={index}
              className={`grid items-end gap-3 rounded-control border border-border p-3 ${
                taxable
                  ? "sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_5rem_auto]"
                  : "sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_auto]"
              }`}
            >
              <label className={label}>
                Treatment<span aria-hidden className="font-normal text-danger-mark"> *</span>
                <input
                  required
                  value={line.description}
                  onChange={(event) => updateLine(index, "description", event.target.value)}
                  placeholder="Root canal, upper left"
                  className={field}
                />
              </label>
              <label className={label}>
                How many<span aria-hidden className="font-normal text-danger-mark"> *</span>
                <input required type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} className={field} />
              </label>
              <label className={label}>
                Price each in ₹<span aria-hidden className="font-normal text-danger-mark"> *</span>
                <input required type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)} className={field} />
              </label>
              <label className={label}>
                Taken off in ₹
                <input type="number" min="0" value={line.discount} onChange={(event) => updateLine(index, "discount", event.target.value)} className={field} />
              </label>
              {taxable && (
                <label className={label}>
                  GST %
                  <input type="number" min="0" max="100" value={line.taxPercent} onChange={(event) => updateLine(index, "taxPercent", event.target.value)} className={field} />
                </label>
              )}

              <div className="flex items-center gap-2">
                <span className="min-h-11 flex-1 content-center rounded-control bg-muted px-3 text-right text-sm font-semibold tabular-nums text-heading sm:min-w-[6rem]">
                  {money(lineTotal(line, taxable))}
                </span>
                <button
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                  className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-control border border-danger-border text-danger hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`Remove line ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3.5 text-[length:var(--text-secondary)]">
          <div className="flex justify-between text-text-muted">
            <span>Before anything is taken off</span>
            <span className="tabular-nums">{money(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-text-muted">
              <span>Taken off</span>
              <span className="tabular-nums">−{money(totals.discount)}</span>
            </div>
          )}
          {taxable && totals.tax > 0 && (
            <div className="flex justify-between text-text-muted">
              <span>GST</span>
              <span className="tabular-nums">{money(totals.tax)}</span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
            <span className="text-base font-semibold text-heading">What they owe</span>
            <span className="text-2xl font-bold tabular-nums text-heading">{money(totals.total)}</span>
          </div>
        </div>

        <input type="hidden" name="totalAmount" value={totals.total} />
        <input type="hidden" name="discountAmount" value={totals.discount} />
      </section>

      {/* --- 4. Paying now, only if they are ------------------------------- */}
      {isBill && (
        <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
          <label className="flex cursor-pointer items-center gap-2.5 text-base font-semibold text-heading">
            <input
              type="checkbox"
              checked={takingPayment}
              onChange={(event) => setTakingPayment(event.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            They are paying something now
          </label>
          {takingPayment && (
            <div className="mt-3 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
              <label className={label}>
                How much
                <input name="amountPaidToday" type="number" min="1" max={totals.total} placeholder="0" className={field} />
              </label>
              <label className={label}>
                How
                <select name="paymentMethod" className={field}>
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Bank transfer</option>
                  <option>Other</option>
                </select>
              </label>
              {/* Named for where it lands. It used to be `paymentNotes`, so the
                  reference a patient quotes back in a dispute went into free
                  text and the receipt's own Ref line stayed empty. */}
              <label className={label}>
                Reference
                <input name="paymentReference" placeholder="UPI or bank reference" className={field} />
              </label>
            </div>
          )}
        </section>
      )}

      {/* --- 5. The rest, folded away -------------------------------------- */}
      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <button
          type="button"
          onClick={() => setShowExtras((open) => !open)}
          aria-expanded={showExtras}
          className="cursor-pointer text-[length:var(--text-secondary)] font-semibold text-primary hover:underline"
        >
          {showExtras ? "Hide the extras" : "Add a note, terms or a due date"}
        </button>
        {showExtras && (
          <div className="mt-3.5 flex flex-col gap-3.5">
            <label className={label}>
              Pay by
              <input name="dueDate" type="date" className={`${field} max-w-xs`} />
            </label>
            <label className={label}>
              What it was for
              <input name="diagnosis" placeholder="e.g. Irreversible pulpitis 36 — RCT initiated" className={field} />
            </label>
            <label className={label}>
              A note on the bill
              <textarea name="notes" rows={2} placeholder="Anything the patient should read" className="rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground" />
            </label>
            <label className={label}>
              Terms
              <textarea name="terms" rows={2} placeholder="When it is due, cancellation, refunds" className="rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground" />
            </label>
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          It will be numbered {invoiceNumberPreview}. Once raised, the wording and figures are fixed —
          a correction goes on its own note.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => router.back()}
            className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            aria-busy={saving}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border border-primary bg-primary px-5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-border-strong disabled:bg-muted disabled:text-text-muted"
          >
            {saving ? <Pending label="Raising…" /> : `Raise this ${DOCUMENT_TYPES.find((type) => type.value === documentType)?.label.toLowerCase()}`}
          </button>
        </div>
      </footer>
    </form>
  );
}
