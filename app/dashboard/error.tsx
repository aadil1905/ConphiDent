"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function DashboardError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error("Dashboard error:", error); }, [error]);
  return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center"><section className="w-full rounded-card border border-border bg-card p-8 text-center shadow-sm"><div className="mx-auto grid size-12 place-items-center rounded-card bg-danger-bg text-danger"><TriangleAlert className="size-6" /></div><h1 className="mt-5 text-2xl font-bold tracking-tight">This page needs another try</h1><p className="mt-2 text-sm leading-6 text-text-muted">DentalAI could not load this screen. Your saved clinic data has not been changed.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={unstable_retry} className="inline-flex min-h-10 items-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95"><RefreshCw className="size-4" />Try again</button><Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-control border border-border px-4 text-sm font-semibold transition hover:bg-muted">Go to dashboard</Link></div></section></div>;
}
