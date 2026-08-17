"use client";

import { useFormStatus } from "react-dom";
import Pending from "@/components/ui/pending";

/** The `useFormStatus` variant of the same pending state the hand-rolled
 *  submit buttons show — spinner, `aria-busy`, and the same wording. */
export default function PendingSubmitButton({ label, pendingLabel, className }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 ${className ?? ""}`}
    >
      {pending ? <Pending label={pendingLabel || "Saving…"} /> : label}
    </button>
  );
}
