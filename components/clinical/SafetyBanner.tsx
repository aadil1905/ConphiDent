import Link from "next/link";
import { AlertTriangle, ShieldQuestion } from "lucide-react";
import type { PatientSafety } from "@/lib/patient-safety";

/**
 * The one patient safety banner, on every screen where someone treats,
 * prescribes, plans or writes up.
 *
 * It always renders. A banner that disappears when nothing is flagged teaches
 * you to read the page instead of the banner, and then the day it *is* there
 * you have already stopped looking. Never collapsed, never dismissible.
 *
 * When something is on file it is red and says it. When nothing is, it stays
 * quiet and neutral but still speaks — because an empty allergy field in this
 * schema cannot distinguish "no allergies" from "nobody asked", and the
 * difference is the whole point of reading it before you treat.
 */
export default function SafetyBanner({
  safety,
  /** Where this gets written down. Without it the banner can only nag. */
  recordHref,
}: {
  safety: PatientSafety;
  recordHref?: string;
}) {
  if (safety.hasAlerts) {
    return (
      <section
        aria-label="Read before treating"
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card border border-danger-border bg-danger-bg px-4 py-3.5"
      >
        <div className="min-w-0 flex-1">
          <p className="mb-1 flex items-center gap-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-bold text-danger">
            <AlertTriangle className="h-4 w-4 flex-none" strokeWidth={2} aria-hidden />
            Read before treating
          </p>
          <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-danger">{safety.lines.join(" · ")}</p>
          {/* Still red, still read first — but a patient typing "penicillin"
              into a link on their phone is not the same evidence as a clinician
              taking it down, and treating them as the same is how an unchecked
              answer quietly becomes a confirmed fact. */}
          {safety.allergiesUnreviewed && (
            <p className="mt-0.5 text-[13px] text-danger">
              As the patient reported it at intake. Nobody at the clinic has confirmed it yet.
            </p>
          )}
        </div>
        {recordHref && (
          <Link
            href={recordHref}
            className="inline-flex min-h-11 flex-none items-center text-[13px] font-semibold text-danger underline underline-offset-2"
          >
            Change this
          </Link>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Nothing recorded before treating"
      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card border border-border bg-muted px-4 py-3.5"
    >
      <div className="min-w-0 flex-1">
        <p className="mb-1 flex items-center gap-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">
          <ShieldQuestion className="h-4 w-4 flex-none text-text-muted" strokeWidth={2} aria-hidden />
          Nothing on file to read
        </p>
        <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
          No allergies or medical alerts are recorded for this patient. That is not the same as none —
          ask, and write down what you are told.
        </p>
      </div>
      {recordHref && (
        <Link
          href={recordHref}
          className="inline-flex min-h-11 flex-none items-center text-[13px] font-semibold text-primary underline underline-offset-2"
        >
          Write it down
        </Link>
      )}
    </section>
  );
}
