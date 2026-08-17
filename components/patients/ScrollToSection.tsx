"use client";

import { useEffect } from "react";

/**
 * The patient record used to be tabbed, and links across the product still say
 * `?tab=Money`. Every section renders on one scrolling page now, so an arriving
 * tab parameter simply scrolls to the section it used to open.
 */
export default function ScrollToSection({ target }: { target: string }) {
  useEffect(() => {
    const tick = setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    }, 0);
    return () => clearTimeout(tick);
  }, [target]);
  return null;
}
