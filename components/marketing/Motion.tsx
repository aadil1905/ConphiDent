"use client";

/**
 * Motion primitives for the public site.
 *
 * Every primitive reads useReducedMotion() and renders the final state
 * immediately when the user asks for reduced motion — there is no path through
 * this file that animates against that preference. Specs come from
 * design-system/conphident/MASTER.md.
 */

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Scroll reveal: fade-dominant, 14px of travel, plays once. */
export function Reveal({
  children,
  delay = 0,
  as = "div",
  className,
  y = 14,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "section" | "article" | "figure" | "li";
  className?: string;
  y?: number;
}) {
  const reduced = useReducedMotion();
  const Tag = motion[as];

  return (
    <Tag
      className={className}
      initial={reduced ? false : { opacity: 0, y }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

/** Parent for a staggered group. Children must be <StaggerChild>. */
export function Stagger({
  children,
  className,
  step = 0.04,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  step?: number;
  as?: "div" | "ul" | "section";
}) {
  const reduced = useReducedMotion();
  const Tag = motion[as];

  return (
    <Tag
      className={className}
      initial={reduced ? false : "hidden"}
      whileInView={reduced ? undefined : "shown"}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      variants={{ shown: { transition: { staggerChildren: step } } }}
    >
      {children}
    </Tag>
  );
}

const childVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function StaggerChild({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "li" | "span";
}) {
  const reduced = useReducedMotion();
  const Tag = motion[as];
  if (reduced) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag className={className} variants={childVariants}>
      {children}
    </Tag>
  );
}

/**
 * Word-level headline reveal. Reserved for short headlines — the guidance is to
 * never split-animate more than about eight words, so anything longer falls
 * back to a plain reveal.
 */
export function WordReveal({
  text,
  className,
  as: Tag = "h1",
}: {
  text: string;
  className?: string;
  as?: "h1" | "h2";
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");

  if (reduced || words.length > 12) {
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag className={className}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
          <motion.span
            style={{ display: "inline-block", willChange: "transform" }}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: index * 0.045, ease: EASE }}
          >
            {word}
            {index < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * Parallax for decorative layers only. Never wrap body copy or a control in
 * this — moving text against the scroll hurts reading and can cause motion
 * sickness.
 */
export function Parallax({
  children,
  className,
  distance = 40,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const raw = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  const y = useSpring(raw, { stiffness: 90, damping: 26, mass: 0.4 });

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduced ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/** Card hover lift. Pointer-only — it never gates information. */
export function Lift({
  children,
  className,
  as = "article",
}: {
  children: ReactNode;
  className?: string;
  as?: "article" | "div" | "li";
}) {
  const reduced = useReducedMotion();
  const Tag = motion[as];

  return (
    <Tag
      className={className}
      variants={childVariants}
      whileHover={reduced ? undefined : { y: -4, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      {children}
    </Tag>
  );
}

/** Counts up to `to` once the element is on screen. */
export function Counter({
  to,
  suffix = "",
  prefix = "",
  duration = 1400,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const [value, setValue] = useState(reduced ? to : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // Ease-out so the number settles rather than stopping dead.
      setValue(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduced, to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {value.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/**
 * Decorative aurora field. Purely atmospheric: it sits behind content with
 * pointer-events disabled and carries no information, so reduced motion simply
 * freezes it rather than removing the colour.
 */
export function Aurora({ className = "mk-aurora" }: { className?: string }) {
  const reduced = useReducedMotion();
  const drift = (x: number[], y: number[], seconds: number) =>
    reduced ? undefined : { x, y, transition: { duration: seconds, repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" as const } };

  return (
    <div className={className} aria-hidden="true">
      <motion.i animate={drift([0, -40, 0], [0, 30, 0], 18)} />
      <motion.i animate={drift([0, 50, 0], [0, -25, 0], 22)} />
      <motion.i animate={drift([0, -30, 0], [0, -35, 0], 26)} />
    </div>
  );
}

/** Adds data-stuck once the page has scrolled, so the nav can gain its border. */
export function useStuck(threshold = 8) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return stuck;
}

export { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, useInView, EASE };
