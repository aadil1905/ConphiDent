"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, MessageCircleMore } from "lucide-react";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";

export default function SendReminderButton({ appointmentId, sentAt }: { appointmentId: number; sentAt: string | null }) {
  const [sending, setSending] = useState(false);
  const router = useRouter();
  const gate = useConfirm();

  async function sendReminder() {
    setSending(true);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ consentConfirmed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success("Reminder sent on WhatsApp.");
      router.refresh();
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
      <ConfirmDialog
        open={gate.open}
        copy={{
          title: "Send the reminder on WhatsApp?",
          body: "Only send it if the patient told you it is fine to message this number about their visits.",
          confirmLabel: "Send it",
          keepLabel: "Not now",
          tone: "primary",
        }}
        onConfirm={gate.confirm}
        onCancel={gate.cancel}
      />
      <button
        type="button"
        disabled={sending}
        onClick={() => gate.ask(() => void sendReminder())}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
      >
        {sending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Sending…
          </>
        ) : (
          <>
            <MessageCircleMore className="size-4" aria-hidden />
            {sentAt ? "Send the reminder again" : "Send a WhatsApp reminder"}
          </>
        )}
      </button>
    </>
  );
}
