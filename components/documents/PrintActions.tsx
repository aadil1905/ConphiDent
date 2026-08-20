"use client";

import Link from "next/link";

export function PrintActions({ backHref, backLabel = "Back", printLabel = "Print / Save PDF" }: { backHref?: string; backLabel?: string; printLabel?: string }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[125mm] items-center justify-between gap-3 print:hidden">
      {backHref ? <Link href={backHref} className="rounded-control border border-border bg-card px-4 py-2 text-sm font-bold text-heading shadow-[var(--shadow)] hover:bg-muted">{backLabel}</Link> : <span />}
      <button type="button" onClick={() => window.print()} className="rounded-control bg-primary px-4 py-2 text-sm font-bold text-white shadow-[var(--shadow)] hover:bg-primary-hover">{printLabel}</button>
    </div>
  );
}
