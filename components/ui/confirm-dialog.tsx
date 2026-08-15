"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ConfirmCopy = {
  /** "Void INV-2044 for ₹12,500?" — name the thing and the amount. */
  title: string;
  /** Name the specific consequence, not the category of action. */
  body: string;
  /** The verb, not "OK". */
  confirmLabel: string;
  keepLabel?: string;
  tone?: "danger" | "primary";
};

/**
 * The only confirmation in the product, and only for things that genuinely
 * cannot be undone. Everything reversible gets an optimistic update and an
 * 8-second Undo on the toast instead.
 */
export function ConfirmDialog({
  open,
  copy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  copy: ConfirmCopy;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const danger = copy.tone !== "primary";

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(18,59,93,0.35)] p-4 backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    >
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-label={copy.title}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full max-w-[460px] flex-col gap-3 rounded-card border border-border-strong bg-card p-4.5 shadow-[var(--shadow-overlay)]"
      >
        <h2 className="text-[17px] font-semibold text-heading">{copy.title}</h2>
        <p className="text-[13px] text-text-muted">{copy.body}</p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            {copy.keepLabel ?? "Keep it"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 cursor-pointer rounded-control border px-4 text-[13px] font-semibold text-white ${
              danger ? "border-danger-mark bg-danger-mark" : "border-primary bg-primary hover:bg-primary-hover"
            }`}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a form submit so it only goes through after the person has read what
 * will happen. Drop-in replacement for the old `window.confirm()` guards.
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback(() => {
    const run = pending.current;
    pending.current = null;
    setOpen(false);
    run?.();
  }, []);

  const ask = useCallback((run: () => void) => {
    pending.current = run;
    setOpen(true);
  }, []);

  return { open, ask, confirm, cancel };
}
