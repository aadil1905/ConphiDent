import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import JourneyStory from "@/components/marketing/JourneyStory";
import { Aurora, Reveal, WordReveal } from "@/components/marketing/Motion";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "A tour of the connected ConphiDent workspace — the day, the diary, the patient record, clinical charting, billing, WhatsApp, laboratory, imaging, operations and insights.",
  alternates: { canonical: "/product" },
};

export default function Product() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">The platform</p></Reveal>
            <WordReveal className="t-display" text="One workspace for the whole clinic day." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                Patient information, the diary, clinical care, money, communication and operations
                behave as one system — because they are written against one record, not stitched
                together after the fact.
              </p>
              <div className="mk-actions">
                <Link href="#workflow" className="mk-button">Follow a patient through it <ArrowRight /></Link>
                <a href={SETUP_URL} className="mk-button-ghost">Start onboarding</a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <JourneyStory />

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Your clinic, specifically</p>
            <h2 className="t-h2">Walk it against your own Monday morning.</h2>
            <p className="t-lead">
              A focused walkthrough can cover intake, the diary, charting, billing, WhatsApp,
              laboratory work, imaging and reporting — whichever of those is hurting most.
            </p>
            <div className="mk-actions">
              <Link href="/demo" className="mk-button">Book a demo <ArrowRight /></Link>
              <Link href="/features" className="mk-button-ghost">Read every capability</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
