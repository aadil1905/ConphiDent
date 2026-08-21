"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type DeleteSubmitButtonProps = {
  label?: string;
  /** Names the specific consequence — not "are you sure". */
  confirmMessage?: string;
  confirmTitle?: string;
  pendingLabel?: string;
};

export default function DeleteSubmitButton({
  label = "Delete",
  confirmMessage = "This cannot be undone.",
  confirmTitle,
  pendingLabel = "Saving…",
}: DeleteSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState<HTMLButtonElement | null>(null);

  const go = () => {
    const button = asking;
    setAsking(null);
    const form = button?.form;
    if (!form) return;
    if (!form.querySelector('input[name="confirmed"]')) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "confirmed";
      field.value = "1";
      form.appendChild(field);
    }
    form.requestSubmit();
  };

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          event.preventDefault();
          setAsking(event.currentTarget);
        }}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-danger-border bg-danger-bg px-3 text-[length:var(--text-secondary)] font-semibold text-danger transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-70"
      >
        {pending ? pendingLabel : label}
      </button>
      <ConfirmDialog
        open={asking !== null}
        copy={{
          title: confirmTitle ?? `${label}?`,
          body: confirmMessage,
          confirmLabel: label,
        }}
        onConfirm={go}
        onCancel={() => setAsking(null)}
      />
    </>
  );
}
