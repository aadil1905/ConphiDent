"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function PatientAppointmentResponse({ token, patientName }: { token: string; patientName: string }) {
  const [response, setResponse] = useState<"CONFIRMED" | "RESCHEDULE_REQUESTED" | null>(null);
  const [requestedTime, setRequestedTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  async function submit() {
    if (!response) return;
    if (response === "RESCHEDULE_REQUESTED" && !requestedTime.trim()) {
      toast.error("Please share a preferred day or time.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await fetch(`/api/public-appointment/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, requestedTime, note }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Your response could not be saved.");
      setCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Your response could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return <section className="rounded-card border border-success-border bg-card p-8 text-center shadow-[var(--shadow)]"><CheckCircle2 className="mx-auto size-14 text-success" /><h2 className="mt-4 text-2xl font-bold text-heading">Thank you, {patientName}</h2><p className="mt-2 text-text-muted">{response === "CONFIRMED" ? "Your appointment is confirmed. We look forward to seeing you." : "Your request has reached the clinic. A team member will help you choose a new time."}</p></section>;
  }

  return <section className="rounded-card border bg-card p-5 shadow-[var(--shadow)] sm:p-7"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-card bg-secondary text-primary"><CalendarClock className="size-5" /></span><div><h2 className="text-xl font-bold text-heading">Can you make this appointment?</h2><p className="mt-1 text-sm leading-6 text-text-muted">Confirm in one tap, or tell us what time would work better. The clinic will always review reschedule requests before changing your booking.</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setResponse("CONFIRMED")} className={`rounded-card border p-4 text-left transition ${response === "CONFIRMED" ? "border-success-border bg-success-bg" : "border-border hover:border-success-border"}`}><CheckCircle2 className="size-5 text-success" /><strong className="mt-3 block text-heading">Yes, I&apos;ll be there</strong><span className="mt-1 block text-sm text-text-muted">Confirm this appointment.</span></button><button type="button" onClick={() => setResponse("RESCHEDULE_REQUESTED")} className={`rounded-card border p-4 text-left transition ${response === "RESCHEDULE_REQUESTED" ? "border-primary bg-secondary" : "border-border hover:border-border"}`}><MessageCircle className="size-5 text-primary" /><strong className="mt-3 block text-heading">I need another time</strong><span className="mt-1 block text-sm text-text-muted">Send a request to the clinic.</span></button></div>{response === "RESCHEDULE_REQUESTED" ? <div className="mt-6 space-y-4"><label className="block text-sm font-semibold text-heading">Preferred day or time<textarea value={requestedTime} onChange={(event) => setRequestedTime(event.target.value)} placeholder="For example: Saturday morning or after 5 PM" className="mt-2 min-h-24 w-full rounded-control border border-border bg-card p-3 text-sm outline-none outline-none" /></label><label className="block text-sm font-semibold text-heading">Anything else the clinic should know? <span className="font-normal text-text-muted">(optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" className="mt-2 min-h-20 w-full rounded-control border border-border bg-card p-3 text-sm outline-none outline-none" /></label></div> : null}<button type="button" disabled={!response || submitting} onClick={submit} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-card bg-primary px-6 font-bold text-white shadow-[var(--shadow)] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="size-5 animate-spin" /> : response === "CONFIRMED" ? <CheckCircle2 className="size-5" /> : <MessageCircle className="size-5" />}{submitting ? "Saving your response..." : response === "CONFIRMED" ? "Confirm appointment" : "Send reschedule request"}</button></section>;
}
