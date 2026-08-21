"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { reportCrash } from "@/components/ui/report-crash";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportCrash("dashboard", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <section className="w-full rounded-card border border-border bg-card p-8 text-center shadow-[var(--shadow)]">
        <div className="mx-auto grid size-12 place-items-center rounded-card bg-danger-bg text-danger">
          <TriangleAlert className="size-6" />
        </div>
        <h1 className="mt-5 text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold text-heading">
          This page needs another try
        </h1>
        <p className="mt-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
          This screen could not load. Your saved clinic data has not been changed.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={unstable_retry}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control bg-primary px-4 text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold text-primary-foreground shadow-[var(--shadow)] hover:bg-primary-hover"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] leading-[var(--text-secondary-lh)] font-semibold text-heading hover:bg-muted"
          >
            Go to dashboard
          </Link>
        </div>
      </section>
    </div>
  );
}
