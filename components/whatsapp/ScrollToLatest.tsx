"use client";

import { useEffect, useRef } from "react";

/**
 * A chat opens on the newest message, with the history above it — the way every
 * messenger behaves. A plain overflow container starts at the top instead, so
 * the thread opened on the oldest line and the reader had to scroll *down* to
 * find out what was just said.
 *
 * This renders a sentinel at the end of the thread and jumps the nearest
 * scrolling ancestor to the bottom whenever the open conversation changes.
 */
export default function ScrollToLatest({ conversationId }: { conversationId: number | string }) {
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;

    // After paint: bubbles and the wallpaper must be laid out before the
    // scroll height is meaningful.
    const tick = requestAnimationFrame(() => {
      let scroller: HTMLElement | null = node.parentElement;
      while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
        scroller = scroller.parentElement;
      }
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });

    return () => cancelAnimationFrame(tick);
  }, [conversationId]);

  return <div ref={anchor} aria-hidden="true" />;
}
