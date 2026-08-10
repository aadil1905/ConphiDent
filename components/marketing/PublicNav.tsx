"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const links = [["Platform", "/product"], ["Capabilities", "/features"], ["WhatsApp", "/product#whatsapp"], ["About", "/about"]] as const;

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  return <>
    <nav className="mk-desktop-nav" aria-label="Main navigation">{links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>
    <button type="button" className="mk-menu-button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="public-mobile-nav" onClick={() => setOpen((value) => !value)}>{open ? <X/> : <Menu/>}</button>
    <div id="public-mobile-nav" className={`mk-mobile-nav ${open ? "is-open" : ""}`}>{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}<Link href="/demo#demo-request" onClick={() => setOpen(false)}>Contact</Link><Link href="/demo" className="mk-button" onClick={() => setOpen(false)}>Book a demo</Link></div>
  </>;
}
