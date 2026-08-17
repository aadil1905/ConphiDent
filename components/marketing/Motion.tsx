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
  useMotionValue,
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

/**
 * Real depth, on the compositor, for a decorative product frame.
 *
 * This is genuine 3D — a perspective camera and rotation about X and Y — done
 * with CSS transforms rather than WebGL. That is a deliberate choice, not a
 * shortcut: a three.js scene is roughly 150KB before anything is drawn, and the
 * guidance for it is that desktop-to-mobile GPU ratios run about 10:1. The
 * audience here is dental practices on mid-range Android phones. Transform and
 * opacity are the only two properties the browser can animate without paint or
 * layout, so this costs effectively nothing and still tilts in real space.
 *
 * Three refusals are built in:
 *
 *  - **Pointer-fine only.** On a touch screen there is no hover, and a tilt that
 *    fires on tap reads as a bug. Coarse pointers get the flat card.
 *  - **Reduced motion gets nothing.** Not a smaller tilt — none.
 *  - **`will-change` is set while tilting and dropped on leave**, so an idle
 *    page is not holding a compositor layer per card.
 *
 * Children can layer themselves in the same space with `translateZ`; the
 * container establishes `transform-style: preserve-3d`.
 */
export function Tilt({
  children,
  className,
  /** Maximum rotation in degrees. Above about 10 the illusion turns into a gimmick. */
  max = 7,
  perspective = 1200,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  perspective?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  // Pointer offset from the centre of the card, -0.5 to 0.5 on each axis.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 150, damping: 20, mass: 0.5 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [max, -max]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-max, max]), spring);

  useEffect(() => {
    if (reduced) return;
    // A tilt that needs a hover has no meaning where hover does not exist.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setEnabled(fine.matches);
    sync();
    fine.addEventListener("change", sync);
    return () => fine.removeEventListener("change", sync);
  }, [reduced]);

  if (reduced || !enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective }}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - box.left) / box.width - 0.5);
        py.set((event.clientY - box.top) / box.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        // Held only while the pointer is inside, so an untouched page keeps no
        // extra compositor layers alive.
        whileHover={{ willChange: "transform" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * Counts up to `to` once the element is on screen.
 *
 * Two things here are load-bearing, and both were live bugs.
 *
 * **It must never show a zero.** The hero's figures use this, and every
 * visibility test tried here failed in a way that put "0 visits today, 0 new
 * patients, ₹0 collected" on the first screen of the site. The reasoning for
 * dropping them entirely is in the effect below.
 *
 * **It must settle on the real number when motion is reduced.** `useReducedMotion`
 * resolves after the first render, so seeding state with `reduced ? to : 0` ran
 * before the answer was known: a visitor with reduced motion got a permanent
 * zero, because the effect below then returned early forever. The displayed
 * figure is derived from `reduced` on every render instead of stored, so there
 * is no render in which it can be wrong.
 */
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
  const [counted, setCounted] = useState(0);

  // Starts on mount. Not when it scrolls into view, and not from a measurement
  // taken at mount either — both were tried and both left a zero on screen.
  //
  // The observer excluded a band near the fold. Measuring on mount replaced
  // that with a subtler failure: the reading is taken before the webfont
  // swaps, the hero copy is a different height with the fallback, and a figure
  // that settles just inside the fold a moment later has already been judged
  // off-screen. Both bugs looked identical to a visitor — "0 visits today,
  // 0 new patients, ₹0 collected" on the first screen of the site.
  //
  // So there is no visibility test left to get wrong. A figure below the fold
  // finishes counting before anyone reaches it and is simply correct when they
  // do; the only thing given up is a flourish nobody was there to watch. The
  // hero's figures, which are the ones that matter, still animate.
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // Ease-out so the number settles rather than stopping dead.
      setCounted(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, to, duration]);

  // Derived, not stored: with motion reduced the figure is simply the figure,
  // and there is no render in which it is zero.
  const shown = reduced ? to : counted;

  return (
    <span>
      {prefix}
      {shown.toLocaleString("en-IN")}
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
