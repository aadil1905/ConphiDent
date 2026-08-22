"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { markVisitCompletedAction } from "@/app/dashboard/patients/[id]/actions";

/**
 * A visit row's two actions: open it, or — while it's still Pending or
 * Confirmed — flip it straight to Completed without leaving the patient's
 * own profile. Mirrors TreatmentPlanRowAction's Continue/Completed pair.
 */
export default function VisitRowAction({
  appointmentId,
  visitHref,
  completed,
  canComplete,
}: {
  appointmentId: number;
  visitHref: string;
  completed: boolean;
  canComplete: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(completed);
  const [, startTransition] = useTransition();
  // The button unmounts the instant the click lands (below), so keyboard
  // focus would otherwise fall back to <body> mid-interaction.
  const openLink = useRef<HTMLAnchorElement>(null);

  const complete = () => {
    setBusy(true);
    setDone(true);
    openLink.current?.focus();
    startTransition(() => {
      void markVisitCompletedAction(appointmentId).then((result) => {
        setBusy(false);
        if (!result.ok) {
          setDone(false);
          toast.error(result.message);
          return;
        }
        toast.success("Visit marked completed.");
      });
    });
  };

  return (
    <div className="flex justify-end gap-2">
      {canComplete && !done && (
        <button
          type="button"
          disabled={busy}
          onClick={complete}
          aria-label="Mark this visit completed"
          className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
        >
          Mark completed
        </button>
      )}
      <Link
        ref={openLink}
        href={visitHref}
        className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-heading hover:bg-muted"
      >
        Open
      </Link>
    </div>
  );
}
