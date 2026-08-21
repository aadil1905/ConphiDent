"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { addInventoryItemAction, adjustInventoryAction } from "@/app/dashboard/operations/actions";

const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground outline-none";
const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-heading";

function Overlay({ onClose, children, side = false }: { onClose: () => void; children: React.ReactNode; side?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[95] flex bg-[var(--overlay)] backdrop-blur-[2px] ${side ? "justify-end" : "items-center justify-center p-4"}`}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={
          side
            ? "flex h-full w-[min(100%,430px)] flex-col overflow-y-auto bg-card p-5 shadow-[var(--shadow-overlay)]"
            : "w-[min(100%,420px)] rounded-card border border-border bg-card p-5 shadow-[var(--shadow-overlay)]"
        }
      >
        {children}
      </div>
    </div>
  );
}

/** "Add an item" — the way new things enter the cupboard. */
export function AddItemButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    startTransition(async () => {
      try {
        await addInventoryItemAction(data);
        toast.success(`${name} is in the cupboard.`);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : "That didn't save — try again.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground whitespace-nowrap hover:bg-primary-hover"
      >
        Add an item
      </button>
      {open && (
        <Overlay side onClose={() => setOpen(false)}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Add an item</h2>
              <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                Name and unit are enough — everything else can wait.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-10 flex-none cursor-pointer place-items-center rounded-control border border-border-strong text-heading hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className={labelClass}>What is it? *
              <input name="name" required minLength={2} placeholder="e.g. Latex gloves, medium" className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>Category
                <input name="category" placeholder="Clinical supplies" className={field} />
              </label>
              <label className={labelClass}>Counted in
                <input name="unit" placeholder="boxes, packs, units" className={field} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>How many right now
                <input name="quantity" type="number" min="0" placeholder="0" className={field} />
              </label>
              <label className={labelClass}>Usually keep at least
                <input name="reorderLevel" type="number" min="0" placeholder="5" className={field} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>Batch number
                <input name="batchNumber" placeholder="Optional" className={field} />
              </label>
              <label className={labelClass}>Expiry
                <input name="expiryDate" type="date" className={field} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>Cost per unit (₹)
                <input name="costPerUnit" type="number" min="0" placeholder="Optional" className={field} />
              </label>
              <label className={labelClass}>Order this many at a time
                <input name="reorderQuantity" type="number" min="0" placeholder="Optional" className={field} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>Supplier
                <input name="supplier" placeholder="Optional" className={field} />
              </label>
              <label className={labelClass}>Where it lives
                <input name="storageLocation" placeholder="e.g. Cupboard 2" className={field} />
              </label>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="mt-1 min-h-12 cursor-pointer rounded-control border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "Adding…" : "Put it in the cupboard"}
            </button>
            <p className="text-xs text-text-muted">
              Opening stock lands as a batch, so expiry tracking works from day one. Adding an
              existing item updates its details instead.
            </p>
          </form>
        </Overlay>
      )}
    </>
  );
}

/** Per-row "Add stock" — a delivery or top-up outside a purchase order. */
export function ReceiveStockButton({ id, name, unit }: { id: number; name: string; unit: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("adjustment") || 0);
    if (!quantity || quantity < 1) {
      toast.message("How many arrived? Enter a number first.");
      return;
    }
    data.set("id", String(id));
    data.set("confirmed", "1");
    startTransition(async () => {
      try {
        await adjustInventoryAction(data);
        toast.success(`${quantity} ${unit} added to ${name}.`);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : "That didn't save — try again.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3 text-xs font-semibold whitespace-nowrap text-heading hover:bg-muted"
      >
        Add stock
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)}>
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Stock arrived for {name}?</h2>
          <p className="mt-0.5 mb-3.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            It goes on the ledger as a batch — expiry first, so nothing old hides at the back.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className={labelClass}>How many came in ({unit}) *
              <input name="adjustment" type="number" min="1" required placeholder="10" className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>Batch number
                <input name="batchNumber" placeholder="Optional" className={field} />
              </label>
              <label className={labelClass}>Expiry
                <input name="expiryDate" type="date" className={field} />
              </label>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
              >
                Not now
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {pending ? "Adding…" : "Add it"}
              </button>
            </div>
          </form>
        </Overlay>
      )}
    </>
  );
}
