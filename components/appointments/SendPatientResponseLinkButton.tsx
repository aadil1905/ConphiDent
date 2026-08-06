"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function SendPatientResponseLinkButton({ appointmentId }: { appointmentId: number }) {
  const [sending, setSending] = useState(false);

  async function sendLink() {
    setSending(true);
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/self-service`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create the response link.");
      if (body.warning) {
        await navigator.clipboard?.writeText(body.link);
        toast.warning("Link created but WhatsApp could not send it. The link was copied so you can share it manually.");
      } else {
        toast.success("Secure confirmation link sent on WhatsApp.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the response link.");
    } finally {
      setSending(false);
    }
  }

  return <Button onClick={sendLink} disabled={sending} variant="outline" className="h-11 rounded-xl border-sky-200 bg-sky-50 px-5 font-bold text-sky-800 hover:bg-sky-100">{sending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}{sending ? "Creating link..." : "Send response link"}</Button>;
}
