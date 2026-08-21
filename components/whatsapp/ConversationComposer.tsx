"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Send } from "lucide-react";
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
    <div className="flex flex-col gap-2 border-t border-border/70 bg-[var(--wa-paper)] px-3 py-2.5 sm:px-4">
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
            className="min-h-11 cursor-pointer rounded-pill border border-border-strong bg-card px-3 text-xs font-semibold whitespace-nowrap text-heading hover:bg-muted"
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
          className="min-h-[44px] min-w-0 flex-1 resize-none rounded-[1.4rem] border border-border bg-card px-4 py-3 text-[length:var(--text-secondary)] text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !reply.trim()}
          aria-label={sending ? "Sending" : "Send message"}
          title="Send"
          className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-full border border-primary bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          <Send className={`h-[17px] w-[17px] ${sending ? "animate-pulse" : ""}`} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
