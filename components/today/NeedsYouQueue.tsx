"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { closeFollowUpAction, reopenFollowUpAction, type ActionResult } from "@/app/dashboard/today-actions";

export type QueueItem = {
  /** Follow-up tasks can be closed here; everything else just links out. */
  taskId: number | null;
  who: string;
  what: string;
  due: string;
  exact: string;
  overdue: boolean;
  primaryLabel: string;
  primaryHref: string | null;
  secondaryLabel: string;
  secondaryHref: string;
};

const UNDO_MS = 8000;

export default function NeedsYouQueue({
  items,
  total,
  overdueCount,
  moreHref,
}: {
  items: QueueItem[];
  total: number;
  overdueCount: number;
  moreHref: string;
}) {
  const [closed, setClosed] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  const open = items.filter((item) => item.taskId === null || !closed.includes(item.taskId));

  /** Roll the row back and say what happened, in that order. */
  const settle = async (taskId: number, run: Promise<ActionResult>) => {
    const result = await run;
    if (result.ok) return;
    setClosed((current) => current.filter((id) => id !== taskId));
    toast.error(result.message);
  };

  const close = (item: QueueItem) => {
    const taskId = item.taskId;
    if (taskId === null) return;
    setClosed((current) => [...current, taskId]);

    toast.success(`${item.primaryLabel} — logged against ${item.who.split(" ")[0]}.`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          setClosed((current) => current.filter((id) => id !== taskId));
          startTransition(() => {
            void reopenFollowUpAction(taskId);
          });
        },
      },
    });

    startTransition(() => {
      void settle(taskId, closeFollowUpAction(taskId, item.primaryLabel));
    });
  };

  return (
    <section
      aria-labelledby="needs-you"
      className="rounded-card border border-border bg-card shadow-[var(--shadow)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-4 pb-3">
        <h2 id="needs-you" className="text-lg font-semibold text-heading">
          Needs you today
        </h2>
        <span className="text-xs text-text-muted">
          {open.length === 0
            ? "All clear"
            : `Showing ${open.length} of ${total} open · ${overdueCount} overdue`}
        </span>
      </div>

      {open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4.5 pt-8 pb-10 text-center">
          <Check className="h-6.5 w-6.5 text-success" strokeWidth={2} aria-hidden />
          <p className="text-[15px] font-semibold text-heading">Nothing overdue. Nice.</p>
          <p className="max-w-[26rem] text-[13px] text-text-muted">
            Anything that needs chasing will show up here the moment it does.
          </p>
        </div>
      ) : (
        open.map((item, index) => (
          <div
            key={`${item.taskId ?? "link"}-${index}`}
            className={`grid grid-cols-1 items-center gap-3.5 border-t border-border px-4.5 py-3 lg:grid-cols-[minmax(0,1fr)_300px] ${
              item.overdue ? "border-l-[3px] border-l-danger-mark" : "border-l-[3px] border-l-warning"
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-heading">{item.who}</span>
                <span
                  title={item.exact}
                  className={`text-xs font-semibold ${item.overdue ? "text-danger" : "text-text-muted"}`}
                >
                  {item.due}
                </span>
              </div>
              <p className="text-[13px] text-text-muted">{item.what}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {item.primaryHref ? (
                <Link
                  href={item.primaryHref}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-primary-hover"
                >
                  {item.primaryLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => close(item)}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-primary-hover"
                >
                  {item.primaryLabel}
                </button>
              )}
              <Link
                href={item.secondaryHref}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
              >
                {item.secondaryLabel}
              </Link>
            </div>
          </div>
        ))
      )}

      {total > open.length && open.length > 0 && (
        <div className="border-t border-border px-4.5 py-3">
          <Link href={moreHref} className="text-[13px] font-semibold text-primary hover:underline">
            See all {total} in Growth →
          </Link>
        </div>
      )}
    </section>
  );
}
