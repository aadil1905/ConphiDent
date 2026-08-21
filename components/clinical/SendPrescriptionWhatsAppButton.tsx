"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";

export default function SendPrescriptionWhatsAppButton({ prescriptionId }: { prescriptionId: number }) {
  const [sending, setSending] = useState(false);
  const gate = useConfirm();

  async function send() {
    setSending(true);
    try {
      const response = await fetch(`/api/prescriptions/${prescriptionId}/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentConfirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That didn't send.");
      toast.success("On its way. They get a private link that runs out.");
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
        disabled={sending}
        onClick={() => gate.ask(() => void send())}
        className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted disabled:opacity-70"
      >
        <Send className="size-3.5" aria-hidden />
        {sending ? "Sending…" : "Send on WhatsApp"}
      </button>
      <ConfirmDialog
        open={gate.open}
        copy={{
          title: "Send the prescription on WhatsApp?",
          body: "They get a private link that runs out. Only send it if they told you it is fine to message this number.",
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
