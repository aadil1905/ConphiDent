import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { brandFontVariables } from "@/lib/fonts";
import PublicNav from "./PublicNav";

/** The signup portal lives on its own host, so it is linked absolutely. */
export const SETUP_URL = process.env.NEXT_PUBLIC_SETUP_URL || "https://setup.conphident.live";

export default function PublicShell({ children }: { children: ReactNode }) {
  const brand = (
    <Image
      src="/conphident-logo-transparent.png"
      alt="ConphiDent"
      width={1764}
      height={864}
      className="cf-logo"
      priority
    />
  );

  return (
    <main className={`cf-public ${brandFontVariables}`}>
      <PublicNav brand={brand} setupUrl={SETUP_URL} />

      {children}

      <footer className="cf-footer">
        <div className="cf-wrap mk-footer-grid">
          <div className="mk-footer-brand">
            {brand}
            <p>The connected operating system for modern dental clinics.</p>
            <span>Interface illustrations · Fictional demonstration data</span>
          </div>
          <div>
            <b>Platform</b>
            <Link href="/product">Platform overview</Link>
            <Link href="/features">All capabilities</Link>
            <Link href="/whatsapp">WhatsApp automation</Link>
            <Link href="/security">Security &amp; data</Link>
          </div>
          <div>
            <b>Get started</b>
            <Link href="/demo">Book a demo</Link>
            <a href={SETUP_URL}>Start onboarding</a>
            <Link href="/login">Staff sign in</Link>
            <Link href="/about">About</Link>
          </div>
          <div>
            <b>Legal</b>
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of service</Link>
            <Link href="/data-deletion">Data deletion</Link>
          </div>
          <small>© {new Date().getFullYear()} ConphiDent. Product previews use fictional demonstration data.</small>
        </div>
      </footer>
    </main>
  );
}
