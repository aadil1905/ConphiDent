"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { reportCrash } from "@/components/ui/report-crash";

export default function ImagingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportCrash("imaging", error); }, [error]);
  return <div className="rounded-card border border-danger-border bg-danger-bg p-8 text-center"><TriangleAlert className="mx-auto size-8 text-danger" /><h2 className="mt-3 text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-bold text-danger">The imaging worklist could not be loaded</h2><p className="mt-1 text-sm text-danger">No operation is stuck. Retry the tenant-scoped read, or return later if private storage is unavailable.</p><button type="button" onClick={reset} className="mt-4 rounded-control bg-card border border-danger-border text-danger px-4 py-2 text-sm font-semibold">Try again</button></div>;
}
