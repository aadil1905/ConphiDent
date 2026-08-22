"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { markArrivedAction, markCompletedAction, undoArrivedAction } from "@/app/dashboard/today-actions";
import EmptyState from "@/components/lists/EmptyState";

export type ChairVisit = {
  id: number;
  time: string;
  patientName: string;
  patientHref: string | null;
  reason: string;
  relative: string;
  exact: string;
  state: "seen" | "waiting" | "confirmed" | "unconfirmed";
  /** Set when the visit is blocked on something — a late lab case, say. */
  blocker: string | null;
};

const UNDO_MS = 8000;

const LOOK = {
  seen: { label: "Seen", tone: "text-success bg-success-bg", Icon: Check },
  arrived: { label: "In the chair", tone: "text-heading bg-secondary", Icon: Clock },
  waiting: { label: "Lab pending", tone: "text-warning bg-warning-bg", Icon: AlertTriangle },
  confirmed: { label: "Confirmed", tone: "text-heading bg-muted", Icon: Check },
  unconfirmed: { label: "Not confirmed", tone: "text-warning bg-warning-bg", Icon: AlertTriangle },
} as const;

export default function ChairList({
  visits,
  bookedToday,
  seenToday,
  unconfirmedToday,
}: {
  visits: ChairVisit[];
  bookedToday: number;
  seenToday: number;
  unconfirmedToday: number;
}) {
  const router = useRouter();
  const [arrived, setArrived] = useState<number[]>([]);
  const [completed, setCompleted] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const arrive = (visit: ChairVisit) => {
    setArrived((current) => [...current, visit.id]);
    const firstName = visit.patientName.split(" ")[0];

    toast.success(`${firstName} is in the chair.`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          setArrived((current) => current.filter((id) => id !== visit.id));
          startTransition(() => {
            void undoArrivedAction(visit.id);
          });
        },
      },
    });

    startTransition(() => {
      void markArrivedAction(visit.id).then((result) => {
        if (result.ok) return;
        setArrived((current) => current.filter((id) => id !== visit.id));
        toast.error(result.message);
      });
    });
  };

  // Step 2 of the stepper. Completing lands you on the patient's record —
  // the write-up, the bill and the next booking all start from there.
  const complete = (visit: ChairVisit) => {
    setCompleted((current) => [...current, visit.id]);
    startTransition(() => {
      void markCompletedAction(visit.id).then((result) => {
        if (!result.ok) {
          setCompleted((current) => current.filter((id) => id !== visit.id));
          toast.error(result.message);
          return;
        }
        toast.success(`${visit.patientName.split(" ")[0]}'s visit is done.`);
        if (visit.patientHref) router.push(visit.patientHref);
      });
    });
  };

  return (
    <section
      aria-labelledby="chairs"
      className="rounded-card border border-border bg-card shadow-[var(--shadow)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
        <h2 id="chairs" className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
          Today in the chairs
        </h2>
        <span className="text-xs text-text-muted">
          {bookedToday === 0
            ? "Nothing booked"
            : `Showing ${visits.length} of ${bookedToday} booked · ${seenToday} seen · ${unconfirmedToday} not confirmed`}
        </span>
      </div>

      {visits.length === 0 ? (
        <div className="border-t border-border">
          <EmptyState
            icon={Clock}
            title="The diary is empty today"
            body="A quiet day is a good day to ring the people waiting on a callback."
            action={{ label: "Book a visit", href: "/dashboard/appointments/new" }}
          />
        </div>
      ) : (
        visits.map((visit) => {
          const isArrived = arrived.includes(visit.id);
          const isCompleted = completed.includes(visit.id) || visit.state === "seen";
          const state = isCompleted ? "seen" : isArrived ? "arrived" : visit.state;
          const look = LOOK[state];

          return (
            <div
              key={visit.id}
              className={`grid grid-cols-1 items-center gap-3.5 border-t border-border px-5.5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)] lg:grid-cols-[84px_minmax(0,1fr)_130px_150px_150px] ${
                isArrived ? "bg-card" : ""
              }`}
            >
              {/* The time is the column a dentist scans down to find "now", and it was
                  the smallest thing in its own row — 13px against the 14px patient
                  name beside it. It leads the row, so it reads like it. Same
                  workspace serif as the Schedule day-view gives this same column
                  (app/dashboard/appointments/page.tsx) — this was the size that
                  page's time matched, but never picked up the font-family half of it. */}
              <div className="font-[family-name:var(--font-workspace-display)] text-[length:var(--text-section)] leading-none font-semibold tabular-nums text-heading">
                {visit.time}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  {visit.patientHref ? (
                    <Link href={visit.patientHref} className="text-sm font-semibold text-primary hover:underline">
                      {visit.patientName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-heading">{visit.patientName}</span>
                  )}
                  <span title={visit.exact} className="text-xs text-text-muted">
                    {visit.relative}
                  </span>
                </div>
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  {visit.reason}
                  {visit.blocker && ` · ${visit.blocker}`}
                </p>
              </div>

              <span
                className={`inline-flex w-fit items-center justify-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${look.tone}`}
              >
                <look.Icon className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                {look.label}
              </span>

              {/* The two-step stepper: arrived, then completed. Completing
                  opens the patient's record. A seen visit needs nothing more
                  from this list — the pill already says so. */}
              {!isCompleted && (
                <div className="flex flex-col gap-1.5 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-2">
                  <button
                    type="button"
                    disabled={isArrived}
                    onClick={() => arrive(visit)}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap ${
                      isArrived
                        ? "border-border bg-muted text-text-muted"
                        : "cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                    }`}
                  >
                    {isArrived && <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />}
                    {isArrived ? "Arrived" : "Mark arrived"}
                  </button>
                  <button
                    type="button"
                    onClick={() => complete(visit)}
                    className={`inline-flex min-h-11 w-full items-center justify-center rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap ${
                      isArrived
                        ? "cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                        : "cursor-pointer border-border-strong bg-card text-heading hover:bg-muted"
                    }`}
                  >
                    Mark completed
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <div className="border-t border-border px-5.5 py-3">
        <Link
          href="/dashboard/appointments"
          className="text-[length:var(--text-secondary)] font-semibold text-primary hover:underline"
        >
          See the full day on Schedule →
        </Link>
      </div>
    </section>
  );
}
