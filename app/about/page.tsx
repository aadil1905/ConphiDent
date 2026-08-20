import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HeartPulse, Layers3, Workflow } from "lucide-react";
import { Aurora, Lift, Reveal, Stagger, WordReveal } from "@/components/marketing/Motion";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "About ConphiDent",
  description: "Why ConphiDent exists: dental software should reduce handoffs between the people caring for a patient, not create more of them.",
  alternates: { canonical: "/about" },
};

const principles = [
  { icon: Workflow, title: "One record, not many tools", copy: "A conversation should become an appointment. Clinical work should reach the bill. Lab, imaging and follow-up work should stay visible. That connected model is the whole point of the product." },
  { icon: HeartPulse, title: "Software supports, clinicians decide", copy: "The product organises the work around care. It does not diagnose, does not prescribe on its own and does not pretend to hold clinical judgement." },
  { icon: Layers3, title: "Built for independent practices", copy: "Each clinic gets its own data, configuration, staff access and setup — whether it is one chair or several locations." },
];

export default function About() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">About</p></Reveal>
            <WordReveal className="t-display" text="Built for the operational reality of dental care." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                Most dental software solves one moment well and leaves the clinic to carry the
                context between moments by hand. ConphiDent exists because that carrying is where
                the day actually goes.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap cf-wrap-narrow">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Our product principle</p>
              <h2 className="t-h2">Better clinic software should remove handoffs, not add them.</h2>
              <p className="t-lead">
                Every time a receptionist retypes something a dentist already wrote, or a bill is
                raised by asking someone what happened in the chair, the clinic pays for the gap
                between two tools. We would rather close the gap than sell another tool.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Stagger className="mk-grid-3">
            {principles.map((item) => (
              <Lift key={item.title}>
                <span className="mk-tile-icon"><item.icon /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Come and look</p>
            <h2 className="t-h2">The fastest way to judge it is to see it.</h2>
            <div className="mk-actions">
              <Link href="/demo" className="mk-button">Book a demo <ArrowRight /></Link>
              <a href={SETUP_URL} className="mk-button-ghost">Start onboarding</a>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
