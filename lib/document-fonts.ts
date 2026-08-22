import { Cormorant_Garamond, Lora } from "next/font/google";

/**
 * The stationery pairing, and only the stationery's.
 *
 * Declared in its own module rather than beside the app faces in `lib/fonts.ts`
 * — that one is imported by the root layout, so anything added there ships on
 * every route. These two are wanted on four print sheets and nowhere else, so
 * they travel with the document components that use them.
 *
 * A printed pad is the one surface where the "35 years behind us" register the
 * marketing brief moved away from is exactly right: it is handed across a desk,
 * kept in a paper file, and read as a document rather than an interface.
 */
export const documentDisplayFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-document-display",
  display: "swap",
});

export const documentBodyFont = Lora({
  subsets: ["latin"],
  variable: "--font-document-body",
  display: "swap",
});

export const documentFontVariables = `${documentDisplayFont.variable} ${documentBodyFont.variable}`;
