"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ImagingActionState } from "@/app/dashboard/imaging/actions";
import { useConfirmSubmit } from "@/components/ui/confirm-submit";

type ImagingAction = (previous: ImagingActionState, formData: FormData) => Promise<ImagingActionState>;

function Submit({ label, pendingLabel, tone = "primary" }: { label: string; pendingLabel: string; tone?: "primary" | "danger" | "secondary" }) {
  const { pending } = useFormStatus();
  const classes =
    tone === "danger"
      ? "border-danger-border bg-card text-danger hover:bg-danger-bg"
      : tone === "secondary"
        ? "border-border-strong bg-card text-heading hover:bg-muted"
        : "border-primary bg-primary text-white hover:bg-primary-hover";
  return (
    <button type="submit" disabled={pending} className={`min-h-11 cursor-pointer rounded-control border px-4 text-[13px] font-semibold disabled:opacity-60 ${classes}`}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function ImagingActionForm({
  action,
  children,
  label,
  pendingLabel = "Saving…",
  tone,
  className,
  confirmMessage,
}: {
  action: ImagingAction;
  children: React.ReactNode;
  label: string;
  pendingLabel?: string;
  tone?: "primary" | "danger" | "secondary";
  className?: string;
  confirmMessage?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false, message: "" });
  const { guard, dialog } = useConfirmSubmit({
    title: `${label}?`,
    body: confirmMessage || "This goes into the patient's record and stays there.",
    confirmLabel: label,
  });
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
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Submit label={label} pendingLabel={pendingLabel} tone={tone} />
        {state.message ? (
          <p role="status" className={`text-[13px] ${state.ok ? "text-success" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
