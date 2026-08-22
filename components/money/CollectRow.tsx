"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { rupees } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  reversePaymentAction,
  takePaymentAction,
  voidInvoiceAction,
} from "@/app/dashboard/billing/money-actions";

const METHODS = ["Cash", "UPI", "Card"];
const UNDO_MS = 8000;

/**
 * Collecting money never leaves the list. Amount + method in a popover, the row
 * updates straight away. The receipt itself is printed or opened from the
 * row — nothing here sends it anywhere.
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
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  // The pay/menu popovers portal to <body> (see below), so they are no longer
  // DOM descendants of `wrap` — a click inside them would otherwise look like
  // a click "away" and close them mid-interaction. This ref is what closes
  // that gap.
  const pop = useRef<HTMLDivElement>(null);
  // The trigger that opened the popover, so focus has somewhere real to land
  // back on — the portaled menu leaves the DOM order the browser would
  // otherwise use to figure that out on its own.
  const trigger = useRef<HTMLButtonElement | null>(null);
  // Screen position for the portaled pay/menu popover, captured from `wrap`
  // at the moment it opens. Anchored popovers this transient are simpler to
  // close on scroll than to keep repositioned — see the scroll listener below.
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target)) return;
      if (pop.current?.contains(target)) return;
      setOpen(null);
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

  // The popover's screen position is only valid until whatever scrolls — the
  // Money list's own scroll container, or the page — and closing on scroll is
  // simpler and safer than tracking the anchor through it. Separate effect,
  // armed a frame after open: opening a menu can itself trigger a native
  // scroll-into-view on the trigger button, and listening from the same tick
  // closed the popover it had just opened.
  //
  // Skipped while focus sits inside the popover: the pay panel's amount input
  // autofocuses, and on a phone the on-screen keyboard sliding in scrolls the
  // page well after that first frame, closing a popover nobody scrolled on
  // purpose — the moment someone is actively typing into it is exactly when a
  // scroll should not be read as "dismiss".
  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      if (pop.current?.contains(document.activeElement)) return;
      setOpen(null);
    };
    const armed = requestAnimationFrame(() => window.addEventListener("scroll", onScroll, true));
    return () => {
      cancelAnimationFrame(armed);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Focus the popover on open — the portal leaves it out of the trigger's tab
  // order entirely, so without this a keyboard user's next Tab lands in the
  // NEXT row instead. Restored to the trigger on close, since that reference
  // is what a portaled node can't give the browser for free.
  useEffect(() => {
    if (!open) return;
    const first = pop.current?.querySelector<HTMLElement>("input, a, button");
    first?.focus();
    return () => trigger.current?.focus();
  }, [open]);

  const openAt = (next: "pay" | "menu", from: HTMLButtonElement) => {
    trigger.current = from;
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) {
      // clientWidth excludes a classic scrollbar; innerWidth does not — using
      // innerWidth here quietly shifted every popover ~15-17px left of the
      // row's edge on a non-overlay-scrollbar desktop.
      const viewportWidth = document.documentElement.clientWidth;
      const panelWidth = 280;
      const panelHeight = next === "pay" ? 300 : 130;
      const right = Math.min(Math.max(8, viewportWidth - rect.right), viewportWidth - panelWidth - 8);
      // Flip above the trigger when there isn't room below — a fixed popover
      // can't be scrolled into view, so opening off-screen made it
      // unreachable rather than just awkwardly placed. Clamped to 8: on a
      // viewport shorter than the panel itself, "above" can compute negative
      // too, which would push it off the top edge instead of the bottom one.
      if (rect.bottom + panelHeight + 6 > window.innerHeight) {
        setAnchor({ bottom: Math.max(8, window.innerHeight - rect.top + 6), right });
      } else {
        setAnchor({ top: rect.bottom + 6, right });
      }
    }
    setOpen((current) => (current === next ? null : next));
  };

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
        if (result.ok) {
          toast.success(result.note);
          // The invoice detail page queries `voidedAt: null` and calls
          // notFound() otherwise — voiding from that page (canVoid is true
          // there too) used to strand the receptionist on the site's 404 the
          // moment this revalidated. The Money list is the one place a voided
          // invoice still has a row to look at.
          router.push("/dashboard/billing");
        } else {
          toast.error(result.message);
        }
      });
    });
  };

  const collectable = outstanding > 0;

  return (
    // data-row-popover lifts the CELL this sits in, not just this div: the
    // popover renders inside a `td.relative.z-10` (ListCell interactive), and
    // every later row has an identical td — equal z-index, later in the DOM —
    // so it paints over anything this row opens, no matter the z-index in
    // here. globals.css raises any cell that :has() an open popover.
    <div ref={wrap} data-row-popover={open ? "open" : undefined} className="relative">
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => {
            if (!collectable) {
              // "Receipt" opens the receipt. This used to fire a success toast
              // claiming a WhatsApp send that no code performed — a fake
              // confirmation on a money surface.
              router.push(`/dashboard/billing/${invoiceId}/print`);
              return;
            }
            setAmount(String(outstanding));
            openAt("pay", event.currentTarget);
          }}
          className={`min-h-11 flex-1 cursor-pointer rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap disabled:opacity-70 ${
            collectable
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
              : "border-border-strong bg-card text-heading hover:bg-muted"
          }`}
        >
          {collectable ? `Collect ${rupees(outstanding)}` : "Receipt"}
        </button>
        <button
          type="button"
          onClick={(event) => openAt("menu", event.currentTarget)}
          aria-label={`More for ${invoiceNumber}`}
          aria-expanded={open === "menu"}
          className="grid min-h-11 w-11 flex-none cursor-pointer place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {open === "pay" && anchor && createPortal(
        <div
          ref={pop}
          role="dialog"
          aria-label={`Take a payment on ${invoiceNumber}`}
          style={{ top: anchor.top, bottom: anchor.bottom, right: anchor.right }}
          // Portaled to <body>: a td in a scrolling, z-10-stacked table row is
          // no ancestor any more, so neither clips nor buries this. Position
          // is fixed-to-viewport from the anchor captured in openAt().
          className="fixed z-[100] flex w-[280px] flex-col gap-2.5 rounded-[0.8rem] border border-border-strong bg-card p-3.5 shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
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
              className="min-h-11 rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-body)] tabular-nums text-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="How they paid">
            {METHODS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMethod(option)}
                aria-pressed={method === option}
                className={`min-h-11 cursor-pointer rounded-pill border px-3 text-[length:var(--text-secondary)] font-semibold text-heading ${
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
              className="min-h-11 flex-1 cursor-pointer rounded-control border border-primary bg-primary text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              Take it
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="min-h-11 flex-none cursor-pointer rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
            >
              Cancel
            </button>
          </div>
          <p className="text-[length:var(--text-micro)] text-text-muted">Print or open the receipt from this row afterwards.</p>
        </div>,
        document.body,
      )}

      {open === "menu" && anchor && createPortal(
        <div
          ref={pop}
          role="menu"
          style={{ top: anchor.top, bottom: anchor.bottom, right: anchor.right }}
          className="fixed z-[100] w-[220px] overflow-hidden rounded-[0.8rem] border border-border-strong bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        >
          <Link
            href={`/dashboard/billing/${invoiceId}`}
            role="menuitem"
            className="block min-h-11 border-b border-border/70 px-3.5 py-2.5 text-[length:var(--text-secondary)] text-foreground hover:bg-muted"
          >
            Open the invoice
          </Link>
          <Link
            href={`/dashboard/billing/${invoiceId}/print`}
            role="menuitem"
            className="block min-h-11 border-b border-border/70 px-3.5 py-2.5 text-[length:var(--text-secondary)] text-foreground hover:bg-muted"
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
              className="block min-h-11 w-full cursor-pointer px-3.5 py-2.5 text-left text-[length:var(--text-secondary)] text-danger hover:bg-danger-bg"
            >
              Void this invoice
            </button>
          )}
        </div>,
        document.body,
      )}

      {/* The shared ConfirmDialog, not a hand-rolled one — it already focuses
          the first button on open, handles Escape, and restores focus to
          whoever opened it. The hand-rolled version had none of that despite
          claiming aria-modal. Still portaled: ConfirmDialog itself doesn't,
          and rendered in place it would hit the exact stacking-context trap
          the kebab menu and pay panel did.

          Gated on confirmVoid, not always-mounted with open={confirmVoid}:
          createPortal's second argument is document.body, evaluated eagerly
          wherever this expression sits — unconditionally, that runs on the
          server too, where document does not exist. */}
      {confirmVoid && createPortal(
        <ConfirmDialog
          open={confirmVoid}
          onCancel={() => setConfirmVoid(false)}
          onConfirm={doVoid}
          copy={{
            title: `Void ${invoiceNumber} for ${rupees(total)}?`,
            body:
              paid > 0
                ? `${patientName} keeps the ${rupees(paid)} already paid as credit, and the invoice stops counting towards collections. This cannot be undone.`
                : `${patientName}'s invoice stops counting towards collections. This cannot be undone — a credit note is the reversible option.`,
            confirmLabel: "Void it",
          }}
        />,
        document.body,
      )}
    </div>
  );
}
