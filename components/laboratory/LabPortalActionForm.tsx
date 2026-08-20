"use client";

import { useActionState } from "react";
import { labPortalCaseAction, type LabPortalActionState } from "@/app/lab/cases/[token]/actions";

export function LabPortalActionForm({ token, actionType, label, children, destructive = false }: { token: string; actionType: string; label: string; children?: React.ReactNode; destructive?: boolean }) {
  const action = labPortalCaseAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" } satisfies LabPortalActionState);
  return <form action={formAction} className="space-y-3 rounded-card border bg-card p-4">
    <input type="hidden" name="actionType" value={actionType}/>
    {children}
    <button disabled={pending} className={`rounded-control px-4 py-2 text-sm font-semibold disabled:opacity-60 ${destructive ? "border border-danger-border bg-card text-danger" : "bg-primary text-white"}`}>{pending ? "Saving..." : label}</button>
    {state.message && <p aria-live="polite" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
  </form>;
}

