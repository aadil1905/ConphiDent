"use client";

import dynamic from "next/dynamic";
import type { IntakeFlowProps } from "./PatientIntakeFlow";

/**
 * Rendered in the browser only. The flow restores a half-typed draft from
 * localStorage as its initial state, which the server cannot know about — so
 * skipping the server pass is what keeps the restore honest.
 */
const PatientIntakeFlow = dynamic(() => import("./PatientIntakeFlow"), {
  ssr: false,
  loading: () => (
    // A skeleton shaped like the first page, not a spinner.
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-2 animate-pulse rounded-pill bg-muted" />
      <div className="flex flex-col gap-4 rounded-card bg-card p-[clamp(1rem,4vw,1.5rem)] shadow-[var(--shadow)]">
        <div className="h-6 w-3/5 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-13 w-full animate-pulse rounded-control bg-muted" />
        <div className="h-13 w-full animate-pulse rounded-control bg-muted" />
        <div className="h-13 w-full animate-pulse rounded-control bg-muted" />
      </div>
      <div className="h-[54px] w-full animate-pulse rounded-control bg-muted" />
    </div>
  ),
});

export default function PatientIntakeClient(props: IntakeFlowProps) {
  return <PatientIntakeFlow {...props} />;
}
