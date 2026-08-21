"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { rupees } from "@/lib/format";

const field =
  "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground outline-none";

export default function PaymentForm({
  invoiceId,
  outstanding,
}: {
  invoiceId: number;
  outstanding: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success("Taken. The receipt is on its way.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "That didn't save — your connection dropped. Nothing was lost; try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
        Still owing:{" "}
        <span className="font-semibold tabular-nums text-heading">{rupees(outstanding)}</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">How much</span>
          <input
            required
            name="amount"
            type="number"
            min="1"
            max={outstanding}
            defaultValue={outstanding || ""}
            className={`${field} tabular-nums`}
          />
          <span className="text-xs text-text-muted">Part payments are fine.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">How they paid</span>
          <select required name="method" className={field}>
            <option>Cash</option>
            <option>UPI</option>
            <option>Card</option>
            <option>Bank transfer</option>
            <option>Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">When</span>
          <input
            required
            name="paidAt"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={`${field} tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">Anything to note</span>
          <input name="notes" placeholder="Optional — a reference number, say" className={field} />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving || outstanding === 0}
        className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
      >
        {saving ? "Saving…" : "Take it"}
      </button>
    </form>
  );
}
