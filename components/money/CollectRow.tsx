"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import {
  reversePaymentAction,
  takePaymentAction,
  voidInvoiceAction,
} from "@/app/dashboard/billing/money-actions";

const METHODS = ["Cash", "UPI", "Card"];
const UNDO_MS = 8000;

/**
 * Collecting money never leaves the list. Amount + method in a popover, the row
 * updates straight away, and the receipt goes out on WhatsApp.
 */
export default function CollectRow({
  invoiceId,
  invoiceNumber,
  patientName,
  due,
  total,
  paid,
  canVoid,
}: {
  invoiceId: number;
  invoiceNumber: string;
  patientName: string;
  due: number;
  total: number;
  paid: number;
  canVoid: boolean;
}) {
  const [open, setOpen] = useState<"pay" | "menu" | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState("UPI");
  const [outstanding, setOutstanding] = useState(due);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(null);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        setConfirmVoid(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const take = () => {
    const value = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
    if (value <= 0) {
      toast.error("Put in an amount first.");
      return;
    }
    setBusy(true);
    setOutstanding((current) => Math.max(0, current - value));
    setOpen(null);

    startTransition(() => {
      void takePaymentAction(invoiceId, value, method).then((result) => {
        setBusy(false);
        if (!result.ok) {
          setOutstanding((current) => current + value);
          toast.error(result.message);
          return;
        }
        const paymentId = result.paymentId;
        toast.success(result.note, {
          duration: UNDO_MS,
          action: paymentId
            ? {
                label: "Undo",
                onClick: () => {
                  setOutstanding((current) => current + value);
                  startTransition(() => {
                    void reversePaymentAction(paymentId);
                  });
                },
              }
            : undefined,
        });
      });
    });
  };

  const doVoid = () => {
    setConfirmVoid(false);
    setBusy(true);
    startTransition(() => {
      void voidInvoiceAction(invoiceId, "Voided from the Money list").then((result) => {
        setBusy(false);
        if (result.ok) toast.success(result.note);
        else toast.error(result.message);
      });
    });
  };

  const collectable = outstanding > 0;

  return (
    <div ref={wrap} className="relative">
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!collectable) {
              toast.success(`Receipt sent to ${patientName.split(" ")[0]} on WhatsApp.`);
              return;
            }
            setAmount(String(outstanding));
            setOpen(open === "pay" ? null : "pay");
          }}
          className={`min-h-11 flex-1 cursor-pointer rounded-control border px-3 text-[13px] font-semibold whitespace-nowrap disabled:opacity-70 ${
            collectable
              ? "border-primary bg-primary text-white hover:bg-primary-hover"
              : "border-border-strong bg-card text-heading hover:bg-muted"
          }`}
        >
          {collectable ? `Collect ${rupees(outstanding)}` : "Receipt"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(open === "menu" ? null : "menu")}
          aria-label={`More for ${invoiceNumber}`}
          aria-expanded={open === "menu"}
          className="grid min-h-11 w-11 flex-none cursor-pointer place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open === "pay" && (
        <div
          role="dialog"
          aria-label={`Take a payment on ${invoiceNumber}`}
          className="absolute right-0 top-[calc(100%+6px)] z-30 flex w-[280px] flex-col gap-2.5 rounded-[0.8rem] border border-border-strong bg-card p-3.5 shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">Take a payment · {invoiceNumber}</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">
              Amount — {rupees(outstanding)} still owing of {rupees(total)}
            </span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              autoFocus
              className="min-h-11 rounded-control border border-border-strong bg-card px-3 text-[15px] tabular-nums text-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="How they paid">
            {METHODS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMethod(option)}
                aria-pressed={method === option}
                className={`min-h-11 cursor-pointer rounded-pill border px-3 text-[13px] font-semibold text-heading ${
                  method === option ? "border-primary bg-secondary" : "border-border-strong bg-card"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={take}
              className="min-h-11 flex-1 cursor-pointer rounded-control border border-primary bg-primary text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Take it
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="min-h-11 flex-none cursor-pointer rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-text-muted">Receipt goes out on WhatsApp automatically.</p>
        </div>
      )}

      {open === "menu" && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-30 w-[220px] overflow-hidden rounded-[0.8rem] border border-border-strong bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          <Link
            href={`/dashboard/billing/${invoiceId}`}
            role="menuitem"
            className="block min-h-11 border-b border-border/70 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted"
          >
            Open the invoice
          </Link>
          <Link
            href={`/dashboard/billing/${invoiceId}/print`}
            role="menuitem"
            className="block min-h-11 border-b border-border/70 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted"
          >
            Print the invoice
          </Link>
          {canVoid && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(null);
                setConfirmVoid(true);
              }}
              className="block min-h-11 w-full cursor-pointer px-3.5 py-2.5 text-left text-[13px] text-danger hover:bg-danger-bg"
            >
              Void this invoice
            </button>
          )}
        </div>
      )}

      {confirmVoid && (
        <div
          role="presentation"
          onClick={() => setConfirmVoid(false)}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-[4px]"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`void-${invoiceId}`}
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-[460px] flex-col gap-3 rounded-card border border-border-strong bg-card p-5.5 shadow-[var(--shadow-overlay)]"
          >
            <h2 id={`void-${invoiceId}`} className="text-[17px] font-semibold text-heading">
              Void {invoiceNumber} for {rupees(total)}?
            </h2>
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              {paid > 0
                ? `${patientName} keeps the ${rupees(paid)} already paid as credit, and the invoice stops counting towards collections. This cannot be undone.`
                : `${patientName}'s invoice stops counting towards collections. This cannot be undone — a credit note is the reversible option.`}
            </p>
            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmVoid(false)}
                className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={doVoid}
                className="min-h-11 cursor-pointer rounded-control border border-danger-mark bg-danger-mark px-4 text-[13px] font-semibold text-white"
              >
                Void it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
