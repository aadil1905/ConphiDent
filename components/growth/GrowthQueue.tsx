"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { QueueUndo } from "@/lib/growth-queue";
import {
  assignQueueItemsAction,
  closeQueueItemAction,
  messageQueueItemsAction,
  reopenQueueItemAction,
  snoozeQueueItemAction,
  undoQueueItemAction,
} from "@/app/dashboard/growth/actions";

/** One row of the queue, with every date already written the way a person says it. */
export type QueueRow = {
  key: string;
  name: string;
  phone: string;
  origin: string;
  why: string;
  stage: string;
  ownerLabel: string;
  dueLabel: string;
  dueExact: string;
  tone: "overdue" | "today" | "later";
  kindLabel: string;
  isPatient: boolean;
  patientHref: string | null;
  bookHref: string;
  primaryLabel: string;
  /** A written-off enquiry: the only thing to do with it is bring it back. */
  lost: boolean;
};

export type CloseOutcome = { value: string; label: string };
export type Teammate = { id: number; name: string };

const toneText = {
  overdue: "text-danger",
  today: "text-warning",
  later: "text-text-muted",
} as const;

const toneMark = {
  overdue: "border-l-danger-mark",
  today: "border-l-warning-border",
  later: "border-l-transparent",
} as const;

const ghostButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted disabled:opacity-60";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * Enquiries and patients who need chasing are the same job, so they share one
 * list, one set of filters and one selection. Nothing here is destructive:
 * every action reports what it did and offers Undo for eight seconds.
 */
export default function GrowthQueue({
  title,
  rows,
  pageNote,
  outcomes,
  teammates,
  canMessage,
  emptyTitle,
  emptyBody,
  footer,
}: {
  title: string;
  rows: QueueRow[];
  pageNote: string;
  outcomes: CloseOutcome[];
  teammates: Teammate[];
  canMessage: boolean;
  emptyTitle: string;
  emptyBody: string;
  footer: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [closing, setClosing] = useState<QueueRow | null>(null);
  const [askingToMessage, setAskingToMessage] = useState(false);
  const [assignee, setAssignee] = useState(() => teammates[0]?.id ?? 0);
  const closePanel = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => new Set(rows.map((row) => row.key)), [rows]);
  // Never act on somebody who scrolled off the page or out of the filter.
  const chosen = useMemo(() => selected.filter((key) => visible.has(key)), [selected, visible]);
  const allChecked = rows.length > 0 && rows.every((row) => selected.includes(row.key));

  useEffect(() => {
    if (!closing) return;
    closePanel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setClosing(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closing]);

  function offerUndo(message: string, undo: QueueUndo) {
    toast.success(message, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () =>
          startTransition(async () => {
            const undone = await undoQueueItemAction(undo);
            router.refresh();
            if (!undone) toast.error("That one has already moved on. Nothing was put back.");
          }),
      },
    });
  }

  function snooze(row: QueueRow) {
    startTransition(async () => {
      const undo = await snoozeQueueItemAction(row.key);
      router.refresh();
      if (!undo) {
        toast.error("That one has already moved on. Nothing changed.");
        return;
      }
      offerUndo(`${firstName(undo.name)} moved to tomorrow morning.`, undo);
    });
  }

  function reopen(row: QueueRow) {
    startTransition(async () => {
      const undo = await reopenQueueItemAction(row.key);
      router.refresh();
      if (!undo) {
        toast.error("That one is already back in the queue.");
        return;
      }
      offerUndo(`${firstName(undo.name)} is back in the queue, to ring today.`, undo);
    });
  }

  function close(row: QueueRow, outcome: CloseOutcome) {
    setClosing(null);
    startTransition(async () => {
      const undo = await closeQueueItemAction(row.key, outcome.value);
      router.refresh();
      if (!undo) {
        toast.error("That one has already moved on. Nothing changed.");
        return;
      }
      offerUndo(`${firstName(undo.name)} closed — ${outcome.label.split(" — ")[0].toLowerCase()}.`, undo);
      if (undo.booking) router.push(undo.booking);
    });
  }

  function assign() {
    if (!chosen.length || !assignee) return;
    startTransition(async () => {
      const result = await assignQueueItemsAction(chosen, assignee);
      router.refresh();
      setSelected([]);
      toast.success(
        result.assigned
          ? `${result.assigned} handed to ${firstName(result.name)}.`
          : "Nothing to hand over — those had already been dealt with.",
      );
    });
  }

  function message() {
    setAskingToMessage(false);
    if (!chosen.length) return;
    startTransition(async () => {
      const result = await messageQueueItemsAction(chosen);
      router.refresh();
      setSelected([]);
      const parts = [
        result.sent ? `${result.sent} messaged on WhatsApp` : "",
        result.failed ? `${result.failed} did not go out` : "",
        result.skipped ? `${result.skipped} skipped — they need a patient record first` : "",
      ].filter(Boolean);
      const line = parts.join(" · ") || "Nothing to send.";
      if (result.sent && !result.failed) toast.success(line);
      else toast.warning(line);
    });
  }

  return (
    <>
      {chosen.length > 0 && (
        <div
          role="region"
          aria-label="What to do with the ones you picked"
          // --heading is a text colour: it goes near-white in dark mode by
          // design, which made this "always-dark chrome" band invert into
          // white-on-white. --sidebar is the token built to stay dark in both
          // modes — the same one the nav rail uses.
          className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-sidebar px-4 py-3 text-sidebar-foreground"
        >
          <span className="text-[length:var(--text-secondary)] font-semibold">
            {chosen.length} {chosen.length === 1 ? "person" : "people"} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canMessage && (
              <button
                type="button"
                onClick={() => setAskingToMessage(true)}
                disabled={pending}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-white/40 px-3 text-[length:var(--text-secondary)] font-semibold text-white hover:bg-white/10 disabled:opacity-60"
              >
                Message all of them
              </button>
            )}
            {teammates.length > 0 && (
              <>
                <label className="sr-only" htmlFor="growth-assignee">
                  Who should take these
                </label>
                <select
                  id="growth-assignee"
                  value={assignee}
                  onChange={(event) => setAssignee(Number(event.target.value))}
                  className="min-h-11 cursor-pointer rounded-control border border-white/40 bg-sidebar px-2 text-[length:var(--text-secondary)] font-semibold text-white"
                >
                  {teammates.map((mate) => (
                    <option key={mate.id} value={mate.id} className="text-heading">
                      {mate.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={assign}
                  disabled={pending || !assignee}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-white/40 px-3 text-[length:var(--text-secondary)] font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                >
                  Give them to {firstName(teammates.find((mate) => mate.id === assignee)?.name ?? "")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-control bg-white/15 px-3 text-[length:var(--text-secondary)] font-semibold text-white hover:bg-white/25"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-3.5 pb-2.5">
          <div>
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
            <p className="text-xs text-text-muted">
              Enquiries and patients who need chasing, in one queue. Oldest promise first.
            </p>
          </div>
          {rows.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={() =>
                  setSelected((current) =>
                    allChecked
                      ? current.filter((key) => !visible.has(key))
                      : [...new Set([...current, ...rows.map((row) => row.key)])],
                  )
                }
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Select all shown
            </label>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CheckCheck className="h-7 w-7 text-success" strokeWidth={1.6} aria-hidden />
            <p className="text-[length:var(--text-body)] font-semibold text-heading">{emptyTitle}</p>
            <p className="max-w-[32rem] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{emptyBody}</p>
          </div>
        ) : (
          <ul className="list-none">
            {rows.map((row) => {
              const picked = selected.includes(row.key);
              return (
                <li
                  key={row.key}
                  className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 border-t border-l-[3px] border-border/70 px-5.5 py-3 md:grid-cols-[1.75rem_minmax(0,1fr)_11rem_12rem] md:items-center ${
                    toneMark[row.tone]
                  } ${picked ? "bg-muted" : ""}`}
                >
                  <label className="flex min-h-11 cursor-pointer items-center justify-center">
                    <span className="sr-only">Select {row.name}</span>
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() =>
                        setSelected((current) =>
                          picked ? current.filter((key) => key !== row.key) : [...current, row.key],
                        )
                      }
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </label>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.patientHref ? (
                        <Link
                          href={row.patientHref}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-heading">{row.name}</span>
                      )}
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[length:var(--text-micro)] font-semibold ${
                          row.isPatient ? "bg-secondary text-heading" : "bg-warning-bg text-warning"
                        }`}
                      >
                        {row.kindLabel}
                      </span>
                    </div>
                    <p className="text-xs tabular-nums text-text-muted">
                      {row.phone} · {row.origin}
                    </p>
                    <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">{row.why}</p>
                  </div>

                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <p className={`text-[length:var(--text-secondary)] font-semibold ${toneText[row.tone]}`} title={row.dueExact}>
                      {row.dueLabel}
                    </p>
                    <p className="text-xs text-text-muted">{row.stage}</p>
                    <p className="text-xs text-text-muted">{row.ownerLabel}</p>
                  </div>

                  <div className="col-span-2 grid gap-1.5 md:col-span-1">
                    {row.lost ? (
                      <button
                        type="button"
                        onClick={() => reopen(row)}
                        disabled={pending}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control bg-primary px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                      >
                        Bring them back
                      </button>
                    ) : (
                      <>
                        <Link
                          href={row.bookHref}
                          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-primary-foreground hover:bg-primary-hover"
                        >
                          {row.primaryLabel}
                        </Link>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button type="button" onClick={() => snooze(row)} disabled={pending} className={ghostButton}>
                            Later
                          </button>
                          <button type="button" onClick={() => setClosing(row)} disabled={pending} className={ghostButton}>
                            Done
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5.5 py-3 text-xs text-text-muted">
          <span>{pageNote}</span>
          {footer}
        </div>
      </section>

      {closing && (
        <div
          role="presentation"
          onClick={() => setClosing(null)}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--overlay)] p-5 backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
        >
          <div
            ref={closePanel}
            role="dialog"
            aria-modal="true"
            aria-label={`How did it end with ${firstName(closing.name)}?`}
            onClick={(event) => event.stopPropagation()}
            className="flex w-full max-w-[440px] flex-col gap-3 rounded-card border border-border-strong bg-card p-5 shadow-[var(--shadow-overlay)]"
          >
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
              How did it end with {firstName(closing.name)}?
            </h2>
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              This is the only place the reason gets recorded, so pick the closest one.
            </p>
            <div className="flex flex-col gap-1.5">
              {outcomes.map((outcome) => (
                <button
                  key={outcome.value}
                  type="button"
                  onClick={() => close(closing, outcome)}
                  className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3 text-left text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                >
                  {outcome.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setClosing(null)}
              className="self-end min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
            >
              Keep them in the queue
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={askingToMessage}
        copy={{
          title: `Send a WhatsApp to ${chosen.length} ${chosen.length === 1 ? "person" : "people"}?`,
          body: "By sending you are confirming each of them agreed to hear from the clinic on WhatsApp. Anyone who is only an enquiry, or has already been messaged, is skipped.",
          confirmLabel: "Send the messages",
          keepLabel: "Not now",
          tone: "primary",
        }}
        onConfirm={message}
        onCancel={() => setAskingToMessage(false)}
      />
    </>
  );
}
