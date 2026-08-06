"use client";

import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function WhatsAppQuickSend({ phone, title = "WhatsApp" }: { phone?: string | null; title?: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!phone || !message.trim() || !window.confirm(scheduledAt ? "Schedule this WhatsApp message?" : "Send this WhatsApp message now?")) return;
    setSending(true);
    try {
      const response = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, message, scheduledAt: scheduledAt || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      toast.success(scheduledAt ? "WhatsApp message scheduled." : "WhatsApp message sent.");
      setOpen(false); setMessage(""); setScheduledAt("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send message."); }
    finally { setSending(false); }
  }

  if (!phone) return null;
  return <div className="relative"><button type="button" onClick={() => setOpen(x => !x)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700"><MessageCircle className="size-4" />{title}</button>{open && <div className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border bg-white p-4 shadow-xl"><p className="text-sm font-bold">Preview before sending</p><p className="mt-1 text-xs text-slate-500">To {phone}</p><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a custom message…" className="mt-3 min-h-28 w-full rounded-xl border p-3 text-sm"/><label className="mt-3 block text-xs font-semibold text-slate-600">Schedule delivery (optional)<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"/></label><button type="button" disabled={sending || !message.trim()} onClick={send} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"><Send className="size-4" />{sending ? "Saving…" : scheduledAt ? "Confirm & schedule" : "Confirm & send"}</button></div>}</div>;
}
