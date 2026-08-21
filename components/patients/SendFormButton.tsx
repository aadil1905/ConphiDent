"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { sendIntakeLinkAction } from "@/app/dashboard/patients/[id]/forms-actions";

export default function SendFormButton({
  patientId,
  label,
  primary,
}: {
  patientId: number;
  label: string;
  primary: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();

  const send = () => {
    setSending(true);
    startTransition(() => {
      void sendIntakeLinkAction(patientId).then((result) => {
        setSending(false);
        if (result.ok) toast.success(result.note);
        else toast.error(result.message);
      });
    });
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={sending}
      className={`min-h-11 cursor-pointer rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold disabled:opacity-70 ${
        primary
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
          : "border-border-strong bg-card text-heading hover:bg-muted"
      }`}
    >
      {sending ? "Sending…" : label}
    </button>
  );
}
