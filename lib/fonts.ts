import { Inter, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";

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

/**
 * The workspace display face, and only the workspace's.
 *
 * The 2026-08-17 note above still holds for the public site: a book serif at
 * 68px is the "35 years behind us" register the marketing brief moved away
 * from, and www.conphident.live keeps Plus Jakarta Sans for exactly that
 * reason. The signed-in product is a different argument. Its headings run
 * 20–30px, never display size, and beside them sits Inter at 15px — two
 * grotesques drawn close enough that a section title barely separated from
 * the paragraph under it. That flatness is what the redesign set out to fix,
 * and a serif fixes it in one move: heading and body are told apart before
 * either is read.
 *
 * Scoped by custom property rather than by swapping `displayFont`, so the two
 * registers cannot leak into each other. `.clinic-theme` and `.cf-portal`
 * repoint `--font-display` at this; `.cf-public` does not, and every existing
 * `var(--font-display)` rule follows its own scope with no edit.
 *
 * Tracking moves with it — a serif wants about -0.012em where the grotesque
 * wanted -0.03em. Those overrides live beside the scope declarations.
 */
export const workspaceDisplayFont = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-workspace-display",
  display: "swap",
});

/** Convenience for `className` on a branded surface root. */
export const brandFontVariables = `${displayFont.variable} ${workspaceDisplayFont.variable} ${bodyFont.variable}`;
