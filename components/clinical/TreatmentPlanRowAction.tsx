"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { markTreatmentPlanCompletedAction } from "@/app/dashboard/treatment-plans/actions";

/**
 * Two things a plan's row can do, replacing the three-way Chase it / Book
 * next / Open plan link. Booking the next visit is a real workflow, but it
 * belongs to Schedule, not to a shortcut buried in a status label — Continue
 * opens the plan, where booking, editing and everything else already lives.
 */
export default function TreatmentPlanRowAction({
  planId,
  planHref,
  completed,
  canComplete,
}: {
  planId: number;
  planHref: string;
  completed: boolean;
  canComplete: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(completed);
  const [, startTransition] = useTransition();
  // The button this leaves behind unmounts the moment the click lands (below),
  // so keyboard focus would otherwise fall back to <body> mid-interaction —
  // this gives it somewhere real to land instead.
  const continueLink = useRef<HTMLAnchorElement>(null);

  const complete = () => {
    setBusy(true);
    setDone(true);
    continueLink.current?.focus();
    startTransition(() => {
      void markTreatmentPlanCompletedAction(planId).then((result) => {
        setBusy(false);
        if (!result.ok) {
          setDone(false);
          toast.error(result.message);
          return;
        }
        toast.success("Marked completed.");
      });
    });
  };

  return (
    <div className="flex justify-end gap-2">
      <Link
        ref={continueLink}
        href={planHref}
        className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-heading hover:bg-muted"
      >
        Continue
      </Link>
      {canComplete && !done && (
        <button
          type="button"
          disabled={busy}
          onClick={complete}
          // "Completed" alone reads as this plan's current status to a screen
          // reader, not as the action pressing it takes — the opposite of the
          // truth on every row where the button actually renders.
          aria-label="Mark this plan completed"
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
        >
          Completed
        </button>
      )}
    </div>
  );
}
