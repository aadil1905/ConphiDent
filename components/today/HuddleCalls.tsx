"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  assignFollowUpAction,
  closeFollowUpAction,
  reopenFollowUpAction,
  type ActionResult,
} from "@/app/dashboard/today-actions";

export type HuddleCall = {
  id: number;
  who: string;
  why: string;
  due: string;
  exact: string;
  late: boolean;
  assignedUserId: number | null;
};

export type TeamMember = { id: number; name: string };

const UNDO_MS = 8000;

/**
 * The callback list read out at the huddle. Ticking someone off and putting a
 * name against them both land straight away; the toast carries the way back.
 */
export default function HuddleCalls({
  calls,
  team,
}: {
  calls: HuddleCall[];
  team: TeamMember[];
}) {
  const [done, setDone] = useState<number[]>([]);
  const [owners, setOwners] = useState<Record<number, number | null>>({});
  const [, startTransition] = useTransition();

  const doneCount = done.length;
  const summary =
    calls.length === 0
      ? "Nothing to ring round. Nice."
      : doneCount === calls.length
        ? "All done. Nice."
        : `${doneCount} of ${calls.length} done`;

  const settle = (run: Promise<ActionResult>, rollback: () => void) => {
    startTransition(() => {
      void run.then((result) => {
        if (result.ok) return;
        rollback();
        toast.error(result.message);
      });
    });
  };

  const toggle = (call: HuddleCall, nowDone: boolean) => {
    setDone((current) =>
      nowDone ? [...current, call.id] : current.filter((id) => id !== call.id),
    );

    if (nowDone) {
      toast.success(`${call.who.split(" ")[0]} marked as called.`, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            setDone((current) => current.filter((id) => id !== call.id));
            settle(reopenFollowUpAction(call.id), () =>
              setDone((current) => [...current, call.id]),
            );
          },
        },
      });
      settle(closeFollowUpAction(call.id, "Called at the huddle"), () =>
        setDone((current) => current.filter((id) => id !== call.id)),
      );
      return;
    }

    settle(reopenFollowUpAction(call.id), () =>
      setDone((current) => [...current, call.id]),
    );
  };

  const setOwner = (call: HuddleCall, value: string) => {
    const previous = owners[call.id] ?? call.assignedUserId;
    const next = value === "" ? null : Number(value);
    setOwners((current) => ({ ...current, [call.id]: next }));

    const name = team.find((member) => member.id === next)?.name;
    toast.success(
      next === null
        ? `Nobody is down to call ${call.who.split(" ")[0]} yet.`
        : `${name} will call ${call.who.split(" ")[0]}.`,
      { duration: UNDO_MS },
    );

    settle(assignFollowUpAction(call.id, next), () =>
      setOwners((current) => ({ ...current, [call.id]: previous })),
    );
  };

  return (
    <section className="break-inside-avoid overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)] print:break-inside-avoid print:border-border print:shadow-none">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-4 pb-2.5">
        <h2 className="text-base font-semibold text-heading">Calls to make between patients</h2>
        <span className="text-xs text-text-muted">{summary}</span>
      </div>

      {calls.length === 0 ? (
        <p className="px-4.5 pb-5 text-[13px] text-text-muted">
          Nobody is waiting on a call back this morning.
        </p>
      ) : (
        calls.map((call) => {
          const isDone = done.includes(call.id);
          const owner = call.id in owners ? owners[call.id] : call.assignedUserId;
          return (
            <div
              key={call.id}
              className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-t border-border px-4.5 py-2.5 sm:grid-cols-[26px_minmax(0,1fr)_120px_170px]"
            >
              <label className="flex min-h-11 cursor-pointer items-center justify-center print:hidden">
                <span className="sr-only">Mark {call.who} as called</span>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(event) => toggle(call, event.target.checked)}
                  className="h-[17px] w-[17px] cursor-pointer accent-[var(--primary)]"
                />
              </label>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    isDone ? "text-text-muted line-through" : "text-heading"
                  }`}
                >
                  {call.who}
                </p>
                <p className="text-[13px] text-text-muted">{call.why}</p>
              </div>
              <span
                title={call.exact}
                className={`col-start-2 text-xs font-semibold sm:col-start-3 ${
                  call.late ? "text-danger" : "text-text-muted"
                }`}
              >
                {call.due}
              </span>
              <select
                value={owner === null ? "" : String(owner)}
                onChange={(event) => setOwner(call, event.target.value)}
                aria-label={`Who calls ${call.who}`}
                className="col-start-2 min-h-11 rounded-control border border-border-strong bg-card px-2.5 text-[13px] text-foreground sm:col-start-4 print:hidden"
              >
                <option value="">Nobody yet</option>
                {team.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })
      )}
    </section>
  );
}
