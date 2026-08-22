"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";

/**
 * A figure that rolls up to its value when it first scrolls into view.
 *
 * Adapted from 21st.dev — dillionverma/number-ticker (Magic UI) — for this
 * workspace: `motion/react` instead of framer-motion, en-IN grouping so
 * ₹1,20,000 groups the Indian way, reduced motion renders the final value
 * with no animation, and the SSR fallback text is the real value so nothing
 * flashes empty before hydration.
 */
export function NumberTicker({
  value,
  prefix = "",
  delay = 0,
  className = "",
}: {
  value: number;
  /** "₹" and friends — rendered as plain text ahead of the rolling figure. */
  prefix?: string;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 220 });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const format = (latest: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(latest);

  useEffect(() => {
    if (!isInView) return;
    if (reduced) {
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    const timer = setTimeout(() => motionValue.set(value), delay * 1000);
    return () => clearTimeout(timer);
  }, [motionValue, isInView, delay, value, reduced]);

  useEffect(
    () =>
      springValue.on("change", (latest: number) => {
        if (ref.current) ref.current.textContent = format(Math.round(latest));
      }),
    [springValue],
  );

  return (
    <span className={`inline-block tabular-nums ${className}`}>
      {prefix}
      <span ref={ref}>{format(value)}</span>
    </span>
  );
}

/**
 * The GlanceStrip's values arrive preformatted ("₹12,400", "4"). This peels
 * the numeral out and rolls it, keeping whatever symbol led the string.
 */
export function TickerValue({ text }: { text: string }) {
  const match = text.match(/^([^\d]*)([\d,]+)(.*)$/);
  if (!match || match[3]) return <>{text}</>;
  const value = Number(match[2].replaceAll(",", ""));
  if (!Number.isFinite(value)) return <>{text}</>;
  return <NumberTicker value={value} prefix={match[1]} />;
}
