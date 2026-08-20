"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { LaboratoryActionState } from "@/app/dashboard/laboratory/actions";
import { useConfirmSubmit } from "@/components/ui/confirm-submit";

type Action = (previous: LaboratoryActionState, formData: FormData) => Promise<LaboratoryActionState>;

const DEFAULT_BUTTON =
  "min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60";

export function LabActionForm({
  action,
  children,
  label,
  pendingLabel = "Saving…",
  className = "flex flex-col gap-3",
  buttonClassName = DEFAULT_BUTTON,
  navigateToCase = false,
  confirmMessage,
}: {
  action: Action;
  children: React.ReactNode;
  label: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  navigateToCase?: boolean;
  confirmMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const { guard, dialog } = useConfirmSubmit({
    title: `${label}?`,
    body: confirmMessage || "This goes into the case history and stays there.",
    confirmLabel: label,
  });
  const router = useRouter();
  useEffect(() => {
    if (navigateToCase && state.ok && state.caseId) router.push(`/dashboard/laboratory/${state.caseId}`);
  }, [navigateToCase, router, state.caseId, state.ok]);

  return (
    <form
      action={formAction}
      className={className}
      data-confirmation-managed="true"
      onSubmit={(event) => {
        const asksForAdministrativeReason = Boolean(
          event.currentTarget.querySelector('[name="reason"], [name="correctionReason"]'),
        );
        if (!confirmMessage && !asksForAdministrativeReason) return;
        guard(event);
      }}
    >
      {children}
      {dialog}
      <button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? pendingLabel : label}
      </button>
      {state.message && (
        <p aria-live="polite" className={`text-[13px] ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      {state.secureUrl && (
        <div className="rounded-control border border-success-border bg-success-bg p-3">
          <p className="text-xs font-semibold text-success">
            The link — shown once, right now. Copy it before you leave.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={state.secureUrl}
              className="min-h-11 min-w-0 flex-1 rounded-control border border-border bg-card px-3 text-xs text-foreground"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(state.secureUrl!)}
              className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted"
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
