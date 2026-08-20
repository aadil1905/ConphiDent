"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, useStuck, EASE } from "./Motion";

/**
 * Five destinations, and every one is a page that exists.
 *
 * The brief proposed Product / Solutions / AI + WhatsApp / Security /
 * Resources / Pricing. Solutions, Resources and Pricing have no pages behind
 * them and building empty ones to satisfy a menu would be advertising things
 * the product does not have — the same rule that keeps invented testimonials
 * off this site. "Platform" became "Product" because it says what the page is,
 * and /whatsapp covers the assistant and the limits it runs under, so it is
 * named for both.
 */
const links = [
  ["Product", "/product"],
  ["Capabilities", "/features"],
  ["AI & WhatsApp", "/whatsapp"],
  ["Security", "/security"],
  ["About", "/about"],
] as const;

export default function PublicNav({ brand, setupUrl }: { brand: ReactNode; setupUrl: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const stuck = useStuck();
  const reduced = useReducedMotion();

  // The panel closes from the links themselves rather than from a route-change
  // effect, which would cascade a second render on every navigation.

  // Escape closes the panel, matching every other dismissible surface.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="cf-nav" data-stuck={stuck}>
      <div className="cf-wrap">
        <Link href="/" aria-label="ConphiDent home" className="mk-brand">{brand}</Link>

        <nav className="mk-desktop-nav" aria-label="Main">
          {links.map(([label, href]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="cf-nav-actions">
          <a href={setupUrl} className="mk-button-ghost">Start onboarding</a>
          <Link href="/demo" className="mk-button">Book a demo <ArrowRight /></Link>
        </div>

        <button
          type="button"
          className="mk-menu-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="public-mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              id="public-mobile-nav"
              className="mk-mobile-nav"
              initial={reduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {links.map(([label, href]) => (
                <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
              ))}
              <Link href="/login" onClick={() => setOpen(false)}>Staff sign in</Link>
              <a href={setupUrl} className="mk-button-ghost">Start onboarding</a>
              <Link href="/demo" className="mk-button" onClick={() => setOpen(false)}>Book a demo <ArrowRight /></Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
