import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Inter, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import PublicNav from "./PublicNav";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-marketing-body", display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], variable: "--font-marketing-heading", display: "swap" });

export default function PublicShell({ children }: { children: ReactNode }) {
  const brand = <Image src="/conphident-logo-transparent.png" alt="ConphiDent" width={1764} height={864} className="cf-logo" priority />;

  return <main className={`cf-public ${bodyFont.variable} ${headingFont.variable}`}>
    <header className="cf-nav"><div className="cf-wrap"><Link href="/" aria-label="ConphiDent home" className="mk-brand">{brand}</Link><PublicNav/><div className="cf-nav-actions"><Link href="/demo" className="mk-button">Book a demo <ArrowRight/></Link></div></div></header>
    {children}
    <footer className="cf-footer"><div className="cf-wrap mk-footer-grid"><div className="mk-footer-brand">{brand}<p>The connected operating system for modern dental clinics.</p><span>Real product previews · Fictional demonstration data</span></div><div><b>Platform</b><Link href="/product">Platform overview</Link><Link href="/features">Capabilities</Link><Link href="/product#whatsapp">WhatsApp</Link><Link href="/demo">Book a demo</Link></div><div><b>Company</b><Link href="/about">About</Link><Link href="/demo#demo-request">Contact</Link></div><div><b>Legal</b><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link></div><small>© {new Date().getFullYear()} ConphiDent. Product previews use fictional demo data.</small></div></footer>
  </main>;
}
