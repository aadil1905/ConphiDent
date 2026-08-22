"use client";

import Link from "next/link";

export function PrintActions({ backHref, backLabel = "Back", printLabel = "Print / Save PDF" }: { backHref?: string; backLabel?: string; printLabel?: string }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between gap-3 print:hidden">
      {backHref ? <Link href={backHref} className="inline-flex min-h-11 items-center rounded-control border border-border bg-card px-4 text-sm font-bold text-heading shadow-[var(--shadow)] hover:bg-muted">{backLabel}</Link> : <span />}
      <button type="button" onClick={() => window.print()} className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[var(--shadow)] hover:bg-primary-hover">{printLabel}</button>
    </div>
  );
}
