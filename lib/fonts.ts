import { Inter, Plus_Jakarta_Sans } from "next/font/google";

/**
 * One pairing, shared by every ConphiDent-branded surface: the public site and
 * the operator portal on setup.conphident.live. Declared once so the two cannot
 * drift apart and the browser only ever fetches one copy.
 *
 * Changed from Source Serif 4 / Source Sans 3 on 2026-08-17. The serif carried
 * the "35 years behind us" register; the brief moved to modern SaaS, and a book
 * serif is the single loudest signal of the register it replaced. Plus Jakarta
 * Sans has the slightly humanist geometry that keeps a clinical product from
 * reading cold, and Inter is drawn for interface text at small sizes.
 *
 * Tracking has to move with them: a serif wants about -0.012em, a grotesque at
 * display size wants roughly -0.03em. Headings look untouched but loose if the
 * old values are left behind.
 */
export const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

/** Convenience for `className` on a branded surface root. */
export const brandFontVariables = `${displayFont.variable} ${bodyFont.variable}`;
