"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";

export default function SendPatientResponseLinkButton({ appointmentId }: { appointmentId: number }) {
  const [sending, setSending] = useState(false);
  const gate = useConfirm();

  async function sendLink() {
    setSending(true);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/self-service`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ consentConfirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not make that link.");
      if (body.warning) {
        await navigator.clipboard?.writeText(body.link);
        toast.warning("WhatsApp would not take it, so the link is on your clipboard — paste it to them.");
      } else {
        toast.success("Sent. They can confirm or move the visit from their phone.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `${error.message} Nothing was lost — try again.`
          : "That didn't send — your connection dropped. Nothing was lost; try again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => gate.ask(() => void sendLink())}
        disabled={sending}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted disabled:opacity-70"
      >
        {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {sending ? "Making the link…" : "Let them confirm it themselves"}
      </button>
      <ConfirmDialog
        open={gate.open}
        copy={{
          title: "Send this on WhatsApp?",
          body: "They get a private link to confirm or move the visit. Only send it if they told you it is fine to message this number about their appointments.",
          confirmLabel: "Send it",
          keepLabel: "Not now",
          tone: "primary",
        }}
        onConfirm={gate.confirm}
        onCancel={gate.cancel}
      />
    </>
  );
}
