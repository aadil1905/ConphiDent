"use client";

import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";

export function WhatsAppQuickSend({ patientId, phone, title = "WhatsApp", sourceType = "PATIENT_MESSAGE", sourceId }: { patientId: number; phone?: string | null; title?: string; sourceType?: string; sourceId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);
  const gate = useConfirm();

  async function send() {
    if (!phone || !message.trim()) return;
    setSending(true);
    try {
      const response = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ patientId, phone, message, scheduledAt: scheduledAt || undefined, purpose: "CARE_COMMUNICATION", sourceType, sourceId, consentConfirmed: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success(scheduledAt ? "WhatsApp message scheduled." : "WhatsApp message queued for delivery.");
      setOpen(false); setMessage(""); setScheduledAt("");
    } catch (error) { toast.error(error instanceof Error && error.message ? error.message + " Nothing was lost — try again." : "That didn't send — your connection dropped. Nothing was lost; try again."); }
    finally { setSending(false); }
  }

  if (!phone) return null;
  return <div className="relative"><ConfirmDialog open={gate.open} copy={{ title: scheduledAt ? "Schedule this message?" : "Send this on WhatsApp?", body: "Only send it if the patient told you it is fine to message this number about their care.", confirmLabel: scheduledAt ? "Schedule it" : "Send it", keepLabel: "Not now", tone: "primary" }} onConfirm={gate.confirm} onCancel={gate.cancel} /><button type="button" onClick={() => setOpen(x => !x)} className="inline-flex min-h-10 items-center gap-2 rounded-control bg-primary px-3 text-sm font-bold text-white hover:bg-primary"><MessageCircle className="size-4" />{title}</button>{open && <div className="absolute right-0 z-30 mt-2 w-80 rounded-card border bg-card p-4 shadow-xl"><p className="text-sm font-bold">Preview before sending</p><p className="mt-1 text-xs text-text-muted">To {phone}</p><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a custom message…" className="mt-3 min-h-28 w-full rounded-control border p-3 text-sm"/><label className="mt-3 block text-xs font-semibold text-text-muted">Schedule delivery (optional)<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1 min-h-10 w-full rounded-control border px-3 text-sm"/></label><button type="button" disabled={sending || !message.trim()} onClick={() => gate.ask(() => void send())} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"><Send className="size-4" />{sending ? "Saving…" : scheduledAt ? "Confirm & schedule" : "Confirm & send"}</button></div>}</div>;
}
