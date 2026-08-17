"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, EASE } from "./Motion";

/**
 * A replay of the reception flow the webhook actually runs: language selection,
 * the approved-services answer, the booking hand-off, and the privacy stop on
 * billing questions. Copy is drawn from lib/language.ts, lib/premium-receptionist.ts
 * and lib/prompts.ts so the demonstration cannot drift from the product.
 */
type Turn = {
  from: "patient" | "clinic";
  text: string;
  label?: string;
  chips?: string[];
};

const TURNS: Turn[] = [
  { from: "patient", text: "Hi, do you do root canal? How much does it cost?" },
  {
    from: "clinic",
    label: "Automated reply",
    text: "Namaste! Please choose a language to continue.",
    chips: ["English", "हिन्दी", "मराठी"],
  },
  { from: "patient", text: "English" },
  {
    from: "clinic",
    label: "Automated reply",
    text: "Root Canal Treatment: single-visit endodontic care. The listed fee is ₹6,500. Would you like to book a consultation?",
    chips: ["Book appointment", "Our services", "Clinic timing"],
  },
  { from: "patient", text: "Book appointment" },
  {
    from: "clinic",
    label: "Automated reply",
    text: "Here are the next available slots with our clinical team. Pick one and the clinic will confirm.",
    chips: ["Tomorrow 11:30 AM", "Tomorrow 5:30 PM", "Thu 10:00 AM"],
  },
  { from: "patient", text: "Also, is my last invoice still pending?" },
  {
    from: "clinic",
    label: "Handed to the team",
    text: "I can help with billing, but I can't share invoice or payment details in this chat automatically. Type \"human\" and the clinic team will verify and assist you here.",
  },
];

export default function WhatsAppThread() {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? TURNS.length : 0);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    if (shown >= TURNS.length) {
      // Hold the finished thread, then replay so a returning eye still catches it.
      const restart = setTimeout(() => setShown(0), 6000);
      return () => clearTimeout(restart);
    }

    const next = TURNS[shown];
    if (next.from === "clinic") {
      // Both state changes are scheduled rather than run in the effect body —
      // a synchronous setState here would cascade an extra render every turn.
      const start = setTimeout(() => setTyping(true), 120);
      const think = setTimeout(() => {
        setTyping(false);
        setShown((value) => value + 1);
      }, 1220);
      return () => { clearTimeout(start); clearTimeout(think); };
    }

    const pause = setTimeout(() => setShown((value) => value + 1), 900);
    return () => clearTimeout(pause);
  }, [shown, reduced]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [shown, typing, reduced]);

  return (
    <div className="mk-thread">
      <div className="mk-thread-head">
        <span className="mk-avatar"><MessageCircle /></span>
        <div>
          <b>Your clinic on WhatsApp</b>
          <small>Online · replies instantly</small>
        </div>
      </div>

      <div
        ref={scroller}
        style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", flex: 1 }}
        aria-live="off"
      >
        {TURNS.slice(0, shown).map((turn, index) => (
          <motion.div
            key={`${index}-${turn.text.slice(0, 12)}`}
            className={`mk-bubble ${turn.from === "patient" ? "is-in" : "is-out"}`}
            initial={reduced ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            {turn.label && <b>{turn.label}</b>}
            {turn.text}
            {turn.chips && (
              <span className="mk-chiprow">
                {turn.chips.map((chip) => <i key={chip}>{chip}</i>)}
              </span>
            )}
          </motion.div>
        ))}

        <AnimatePresence>
          {typing && (
            <motion.div
              className="mk-typing"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-label="Clinic is typing"
            >
              {[0, 1, 2].map((dot) => (
                <motion.i
                  key={dot}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
