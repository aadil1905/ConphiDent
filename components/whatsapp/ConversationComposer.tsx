"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { sendConversationMessageAction } from "@/app/dashboard/conversations/actions";

/**
 * The reply box. Quick replies drop ready-made wording into the box rather than
 * sending blind, so what goes out is always something a person read first.
 */
export default function ConversationComposer({
  conversationId,
  firstName,
  outsideWindow,
  optedOut,
  quickReplies,
}: {
  conversationId: number;
  firstName: string;
  outsideWindow: boolean;
  optedOut: boolean;
  quickReplies: { label: string; text: string }[];
}) {
  const router = useRouter();
  const box = useRef<HTMLTextAreaElement>(null);
  const [reply, setReply] = useState("");
  const [sending, startSending] = useTransition();

  const send = () => {
    const content = reply.trim();
    if (!content || sending) return;
    setReply("");
    startSending(async () => {
      try {
        const form = new FormData();
        form.set("conversationId", String(conversationId));
        form.set("content", content);
        await sendConversationMessageAction(form);
        router.refresh();
      } catch {
        setReply(content);
        toast.error("That didn't send — your connection dropped. Nothing was lost; try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border/70 px-4 py-3">
      {(outsideWindow || optedOut) && (
        <p className="flex items-start gap-2 rounded-control border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-px h-[15px] w-[15px] flex-none" strokeWidth={2} aria-hidden />
          <span>
            {optedOut
              ? `${firstName} asked us to stop. Only reply if they message first.`
              : `${firstName} last wrote more than a day ago, so WhatsApp only allows an approved template until they reply.`}
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {quickReplies.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setReply(item.text);
              box.current?.focus();
            }}
            className="min-h-[38px] cursor-pointer rounded-pill border border-border-strong bg-muted px-2.5 text-xs font-semibold whitespace-nowrap text-heading hover:bg-secondary"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          rows={2}
          maxLength={4096}
          aria-label="Write a reply"
          placeholder={`Write to ${firstName} — Enter sends, Shift+Enter for a new line`}
          className="min-w-0 flex-1 resize-y rounded-control border border-border bg-white px-3 py-2.5 text-[13px] text-foreground outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !reply.trim()}
          className="min-h-[46px] flex-none cursor-pointer rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
