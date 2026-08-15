"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateConversationAction } from "@/app/dashboard/conversations/actions";

const MODES = [
  { key: "BOT_ACTIVE", label: "Assistant replies", note: "The assistant will answer this chat again." },
  { key: "HUMAN_ACTIVE", label: "We reply", note: "You are handling this chat now — the assistant will stay quiet." },
  { key: "PAUSED", label: "Paused", note: "Paused. Nothing will go out on this chat." },
] as const;

/** Who answers this chat — the assistant, a person, or nobody. */
export default function HandoffControl({
  conversationId,
  mode,
  status,
  assignedUserId,
  label,
}: {
  conversationId: number;
  mode: string;
  status: string;
  assignedUserId: number | null;
  label: string | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(mode);
  const [, startSaving] = useTransition();

  const pick = (next: (typeof MODES)[number]) => {
    if (next.key === current) return;
    const before = current;
    setCurrent(next.key);
    startSaving(async () => {
      try {
        const form = new FormData();
        form.set("id", String(conversationId));
        form.set("automationMode", next.key);
        form.set("status", status);
        if (assignedUserId) form.set("assignedUserId", String(assignedUserId));
        if (label) form.set("label", label);
        await updateConversationAction(form);
        toast.success(next.note);
        router.refresh();
      } catch {
        setCurrent(before);
        toast.error("That didn't save — your connection dropped. Nothing was lost; try again.");
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Who answers this chat">
      {MODES.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => pick(item)}
          aria-pressed={current === item.key}
          className={`min-h-10 cursor-pointer rounded-control border px-2.5 text-xs font-semibold whitespace-nowrap text-heading ${
            current === item.key ? "border-primary bg-primary-soft" : "border-border-strong bg-card hover:bg-muted"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
