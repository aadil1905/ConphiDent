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
/**
 * No `weight` array on either, deliberately.
 *
 * Listing weights makes `next/font` fetch one static file per weight — seven
 * files, about 157KB, measured on the live site. Omitting it fetches the
 * variable font instead: one file per family covering the whole axis. Fewer
 * requests and less total weight, which is what matters for a clinic opening
 * this on mobile data.
 *
 * An 800 was being shipped and never used; nothing in marketing.css or
 * portal.css asks for a weight above 700.
 */
export const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/** Convenience for `className` on a branded surface root. */
export const brandFontVariables = `${displayFont.variable} ${bodyFont.variable}`;
