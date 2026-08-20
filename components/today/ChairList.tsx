"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { markArrivedAction, undoArrivedAction } from "@/app/dashboard/today-actions";

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
  const [arrived, setArrived] = useState<number[]>([]);
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
        <div className="flex flex-col items-center gap-2 border-t border-border px-5.5 pt-8 pb-10 text-center">
          <Clock className="h-6.5 w-6.5 text-text-muted" strokeWidth={1.8} aria-hidden />
          <p className="text-[15px] font-semibold text-heading">The diary is empty today</p>
          <p className="max-w-[26rem] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            A quiet day is a good day to ring the people waiting on a callback.
          </p>
          <Link
            href="/dashboard/appointments/new"
            className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Book a visit
          </Link>
        </div>
      ) : (
        visits.map((visit) => {
          const isArrived = arrived.includes(visit.id);
          const state = isArrived ? "arrived" : visit.state;
          const look = LOOK[state];
          const canArrive = state !== "seen" && state !== "arrived";
          const actionLabel = state === "seen" ? "Bill this visit" : isArrived ? "Start charting" : "Mark arrived";
          const actionHref =
            state === "seen"
              ? `/dashboard/billing/new?appointment=${visit.id}`
              : isArrived
                ? `/dashboard/clinical-workspace${visit.patientHref ? `/${visit.patientHref.split("/").pop()}` : ""}`
                : null;

          return (
            <div
              key={visit.id}
              className={`grid grid-cols-1 items-center gap-3.5 border-t border-border px-5.5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)] lg:grid-cols-[84px_minmax(0,1fr)_140px_156px] ${
                isArrived ? "bg-card" : ""
              }`}
            >
              {/* The time is the column a dentist scans down to find "now", and it was
                  the smallest thing in its own row — 13px against the 14px patient
                  name beside it. It leads the row, so it reads like it. */}
              <div className="text-[length:var(--text-section)] leading-none font-semibold tabular-nums text-heading">
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

              {actionHref ? (
                <Link
                  href={actionHref}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-primary bg-primary px-3 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-primary-hover"
                >
                  {actionLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => canArrive && arrive(visit)}
                  className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          );
        })
      )}

      <div className="border-t border-border px-5.5 py-3">
        <Link
          href="/dashboard/appointments"
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          See the full day on Schedule →
        </Link>
      </div>
    </section>
  );
}
