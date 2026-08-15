"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * One-tap stock actions ("Used one", quick order) that post a prepared server
 * action and say what happened. Reversible things get their Undo elsewhere —
 * stock movements are ledger entries, so the honest wording is a statement.
 */
export default function StockActionButton({
  action,
  fields,
  label,
  doneNote,
  primary = false,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  doneNote: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.set(key, value);
        await action(form);
        toast.success(doneNote);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "That didn't save — your connection dropped. Nothing was lost; try again.",
        );
      }
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className={`min-h-10 cursor-pointer rounded-control border px-3 text-xs font-semibold whitespace-nowrap disabled:opacity-60 ${
        primary
          ? "border-primary bg-primary text-white hover:bg-primary-hover"
          : "border-border-strong bg-card text-heading hover:bg-muted"
      }`}
    >
      {pending ? "Saving…" : label}
    </button>
  );
}
