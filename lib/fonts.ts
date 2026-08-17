import { Source_Sans_3, Source_Serif_4 } from "next/font/google";

/**
 * One superfamily, shared by every ConphiDent-branded surface: the public site
 * and the operator portal on setup.conphident.live. Declared once so the two
 * cannot drift apart and the browser only ever fetches one copy.
 */
export const displayFont = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

/** Convenience for `className` on a branded surface root. */
export const brandFontVariables = `${displayFont.variable} ${bodyFont.variable}`;
