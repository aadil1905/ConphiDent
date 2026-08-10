import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CheckCircle2, Layers3, MessageCircle, ShieldCheck, Sparkles, UsersRound, Workflow, X } from "lucide-react";
import MarketingMotion from "@/components/marketing/MarketingMotion";
import PlatformExplorer from "@/components/marketing/PlatformExplorer";
import ProductTour from "@/components/marketing/ProductTour";
import PublicShell from "@/components/marketing/PublicShell";
import { tenantFromRequestHost } from "@/lib/platform";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Dental clinic management software", description: "ConphiDent is the connected operating system for modern dental clinics—linking patients, appointments, clinical care, billing, WhatsApp, laboratory work, inventory and follow-up.", alternates: { canonical: "/" } };

const connections = ["Personal details", "Medical history", "Dental chart", "Appointments", "Treatment plan", "Invoices", "Payments", "WhatsApp", "Lab cases", "Follow-up tasks"];

export default async function Home() {
  // A recognised clinic subdomain is a private workspace entry point, not a
  // second copy of the ConphiDent marketing site.
  if (await tenantFromRequestHost()) redirect("/login");

  return <PublicShell><MarketingMotion/>
    <section className="mk-hero"><div className="cf-wrap"><div className="mk-hero-copy" data-reveal><p className="mk-kicker"><span/> The connected operating system for modern dental clinics</p><h1>Every part of your dental clinic, <em>finally working together.</em></h1><p>ConphiDent connects patients, appointments, clinical care, billing, WhatsApp, laboratory work, inventory, and follow-up in one intelligent workspace.</p><div className="mk-actions"><Link href="/demo" className="mk-button">Book a personalised demo <ArrowRight/></Link><Link href="/product" className="mk-text-link">Explore the platform <ArrowRight/></Link></div><div className="mk-trust-line"><span><CheckCircle2/> Real product previews</span><span><CheckCircle2/> Built for dental clinic workflows</span><span><CheckCircle2/> Fictional demo data</span></div></div><figure className="mk-hero-frame" data-reveal><div className="mk-window-bar"><i/><i/><i/><span>ConphiDent · Clinic Command Centre</span></div><Image src="/product/dashboard/dashboard-demo.png" alt="ConphiDent clinic command centre showing the real dashboard with fictional demonstration data" width={950} height={540} sizes="(max-width: 900px) 94vw, 78vw" priority/><figcaption><Sparkles/> One connected view of today’s clinic work.</figcaption></figure></div></section>

    <section className="mk-intro"><div className="cf-wrap" data-reveal><p className="mk-kicker">From first contact to lasting care</p><h2>The clinic journey should feel like one continuous system.</h2><p>From the first WhatsApp enquiry to appointment, clinical care, treatment, payment, laboratory work, inventory, and follow-up—everything works together in one intelligent clinic workspace.</p><div className="mk-flow-line" aria-label="Patient journey"><span>Enquiry</span><ArrowRight/><span>Appointment</span><ArrowRight/><span>Consultation</span><ArrowRight/><span>Treatment</span><ArrowRight/><span>Payment</span><ArrowRight/><span>Follow-up</span></div></div></section>

    <ProductTour/>
    <PlatformExplorer/>

    <section className="mk-record"><div className="cf-wrap mk-record-grid"><div data-reveal><p className="mk-kicker">One connected record</p><h2>The patient record is where the whole clinic comes together.</h2><p>Specialized tools solve one moment. ConphiDent connects the moments, so every role can understand what happened, what is open, and what should happen next.</p><Link href="/product" className="mk-text-link">See the connected platform <ArrowRight/></Link></div><div className="mk-record-map" data-reveal><div className="mk-record-core"><UsersRound/><b>Aarav Mehta</b><span>One connected record</span></div>{connections.map((item, index) => <div key={item} className={`mk-record-node node-${index + 1}`}><Check/>{item}</div>)}</div></div></section>

    <section className="mk-comparison"><div className="cf-wrap"><div className="mk-section-heading" data-reveal><p className="mk-kicker">A calmer operating model</p><h2>Replace fragmented work with connected patient context.</h2></div><div className="mk-compare-grid"><article data-reveal><p className="mk-compare-label"><X/> Without ConphiDent</p>{["Scattered WhatsApp conversations","Manual appointment tracking","Disconnected treatment and billing records","Missed follow-ups","Unclear clinic performance","Manual lab coordination"].map(item => <div key={item}><X/>{item}</div>)}</article><article className="is-connected" data-reveal><p className="mk-compare-label"><Check/> With ConphiDent</p>{["Connected patient context","Centralized scheduling","Treatment, invoices and payments connected","Automated follow-up workflows","Live reports and analytics","Organized lab and inventory operations"].map(item => <div key={item}><Check/>{item}</div>)}</article></div></div></section>

    <section className="mk-ai"><div className="cf-wrap mk-ai-grid"><div data-reveal><p className="mk-kicker">Practical intelligence</p><h2>Automation that supports the team—not unsupported clinical claims.</h2><p>ConphiDent uses AI-assisted workflow support where implemented, alongside automated patient communication, smart follow-up workflows and intelligent clinic summaries. Clinical judgement remains with qualified care teams.</p></div><div className="mk-ai-points" data-reveal><span><Workflow/><b>AI-assisted workflows</b><small>Help organize operational work and context.</small></span><span><MessageCircle/><b>Automated communication</b><small>Support reminders and timely patient follow-up.</small></span><span><Layers3/><b>Connected summaries</b><small>Bring clinic signals together for faster action.</small></span></div></div></section>

    <section className="mk-trust"><div className="cf-wrap"><div className="mk-section-heading" data-reveal><p className="mk-kicker">Built for real clinic workflows</p><h2>Credibility comes from responsible product design.</h2></div><div className="mk-trust-grid">{[["Secure clinic accounts","Authentication protects access to clinic workspaces."],["Role-aware access","Implemented permissions help control what team members can do."],["Tenant-isolated data","Clinic context is resolved and scoped across core workflows."],["Activity records","Implemented audit records support operational traceability."],["Onboarding and support","Demo and onboarding flows help teams understand fit before rollout."],["Transparent demonstration","Public product previews use sanitized, fictional data."]].map(([title, copy]) => <article key={title} data-reveal><ShieldCheck/><h3>{title}</h3><p>{copy}</p></article>)}</div><div className="mk-legal-links"><Link href="/privacy">Privacy policy</Link><Link href="/terms">Terms of service</Link><span>Demo data disclosure</span></div></div></section>

    <section className="mk-final"><div className="cf-wrap" data-reveal><p className="mk-kicker">A walkthrough built around your clinic</p><h2>See how ConphiDent fits your clinic.</h2><p>Tell us what your team wants to improve. We’ll focus the demonstration on the relevant patient, clinical, financial, communication, and operations workflows.</p><div className="mk-actions"><Link href="/demo#demo-request" className="mk-button">Book a personalised demo <CalendarDays/></Link><Link href="/product" className="mk-text-link">Explore the platform <ArrowRight/></Link></div></div></section>
  </PublicShell>;
}
