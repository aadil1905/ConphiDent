"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useConfirmSubmit } from "@/components/ui/confirm-submit";

export default function AuditedActionForm({ action, successMessage, submitLabel, pendingLabel = "Saving…", className = "", submitClassName = "", resetOnSuccess = false, confirmMessage, children }: {
  action: (formData: FormData) => Promise<void>;
  successMessage: string;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const { guard, dialog } = useConfirmSubmit({
    title: `${submitLabel}?`,
    body: confirmMessage || "This is written into the audit history and cannot be taken back.",
    confirmLabel: submitLabel,
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const asksForAdministrativeReason = Boolean(form.querySelector('[name="reason"], [name="correctionReason"]'));
    if (confirmMessage || asksForAdministrativeReason) {
      // The dialog re-submits with data-confirmed set, so this only stops the first pass.
      if (form.dataset.confirmed !== "1") { guard(event); return; }
      delete form.dataset.confirmed;
    }
    setPending(true);
    try {
      const formData = new FormData(form);
      if (confirmMessage || asksForAdministrativeReason) formData.set("confirmed", "1");
      await action(formData);
      if (resetOnSuccess) formRef.current?.reset();
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The action could not be completed.");
    } finally {
      setPending(false);
    }
  }
  return <form ref={formRef} onSubmit={submit} className={className} aria-busy={pending} data-confirmation-managed="true">
    {dialog}
    {children}
    <button type="submit" disabled={pending} className={submitClassName || "inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"}>
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}{pending ? pendingLabel : submitLabel}
    </button>
  </form>;
}
