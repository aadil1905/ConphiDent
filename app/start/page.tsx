import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, CalendarClock, Check, GraduationCap,
  MessageCircle, Rocket, Settings2, ShieldCheck, Stethoscope,
} from "lucide-react";
import { Aurora, Lift, Reveal, Stagger, WordReveal } from "@/components/marketing/Motion";
import PublicShell from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Start onboarding",
  description:
    "Get your dental clinic running on ConphiDent. Tell us about your practice and we will set up your workspace, load your treatments and fees, connect your WhatsApp number and train your team before you go live.",
  alternates: { canonical: "/start" },
  robots: { index: true, follow: true },
};

/** Mirrors the real onboarding stages tracked in the platform setup portal. */
const stages = [
  { icon: MessageCircle, title: "We talk first", copy: "A short call to understand how your clinic runs today, what is costing you time, and whether ConphiDent is actually the right fit. If it is not, we will say so." },
  { icon: Settings2, title: "Your workspace is created", copy: "We create your clinic's own workspace and load your business details, branding, dentists, chairs and opening hours." },
  { icon: Stethoscope, title: "Your treatments and fees go in", copy: "Your service list, durations and prices — the same list the WhatsApp assistant will quote from and your treatment plans will build on." },
  { icon: BadgeCheck, title: "WhatsApp is connected and verified", copy: "Your WhatsApp Business number is connected through Meta, and we track business verification with you so nothing stalls quietly." },
  { icon: CalendarClock, title: "We test it end to end", copy: "You message your own number, walk a booking, raise a test invoice and confirm a reminder lands — before a single patient sees it." },
  { icon: GraduationCap, title: "Your team is trained", copy: "Your front desk, dentists and billing staff each learn the part they will actually use, with their own roles and permissions already set." },
];

const answers = [
  ["What does it cost?", "Pricing depends on the number of dentists and chairs, and on whether you want WhatsApp automation. We will quote you on the first call — there is no charge for starting this process and nothing is billed until you agree."],
  ["How long does it take?", "Most clinics are live within one to two weeks. The slowest step is usually Meta's business verification for WhatsApp, which sits on their side rather than ours."],
  ["Do we have to move all our data at once?", "No. Most clinics start with the diary and WhatsApp, then bring patient history across as they go. We will plan the order with you."],
  ["What if we already use something else?", "Tell us what it is on the form. It changes what we migrate and how we sequence the switch."],
  ["Do we need a new phone number?", "Not usually. If your existing clinic number can be moved to WhatsApp Business, we use it. If you do not have one yet, we will help you get one."],
  ["Can we stop?", "Yes. Your data stays exportable throughout, so leaving is a decision rather than a trap."],
];

export default function StartPage() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">Onboarding</p></Reveal>
            <WordReveal className="t-display" text="Get your clinic running on ConphiDent." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                Tell us about your practice and we will take it from there — workspace, treatments
                and fees, WhatsApp connection, testing and training. Nothing is charged for
                starting, and nothing goes live until you say so.
              </p>
              <div className="mk-actions">
                <Link href="/start/apply" className="mk-button">Start onboarding <ArrowRight /></Link>
                <Link href="/demo" className="mk-button-ghost">See a demo first</Link>
              </div>
              <ul className="mk-ticklist" style={{ marginTop: 30 }}>
                <li><Check /> No card required to begin</li>
                <li><Check /> We reply within one working day</li>
                <li><Check /> Your data stays exportable, always</li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">What happens next</p>
              <h2 className="t-h2">Six steps from this form to your first patient.</h2>
              <p className="t-lead">
                This is the same sequence our team tracks internally for every clinic, so you
                can always ask exactly where yours has got to.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-grid-3">
            {stages.map((stage) => (
              <Lift key={stage.title}>
                <span className="mk-tile-icon"><stage.icon /></span>
                <h3>{stage.title}</h3>
                <p>{stage.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">Before you ask</p>
            <h2 className="t-h2">The questions every clinic asks us.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              Answered here rather than saved for a sales call.
            </p>
            <div className="mk-actions">
              <Link href="/start/apply" className="mk-button">Start onboarding <ArrowRight /></Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <dl className="mk-spec">
              {answers.map(([term, copy]) => (
                <div key={term}><dt>{term}</dt><dd>{copy}</dd></div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Ready when you are</p>
            <h2 className="t-h2">It takes about two minutes.</h2>
            <p className="t-lead">
              Three short steps. We will come back to you within one working day to book your
              setup call.
            </p>
            <div className="mk-actions">
              <Link href="/start/apply" className="mk-button"><Rocket /> Start onboarding</Link>
              <Link href="/security" className="mk-button-ghost">How we handle your data</Link>
            </div>
            <p className="t-small" style={{ marginTop: 24, opacity: .8 }}>
              <ShieldCheck style={{ width: 14, verticalAlign: "-2px", marginRight: 6 }} />
              Already a customer? <Link href="/login" style={{ color: "inherit", textDecoration: "underline" }}>Staff sign in</Link>.
            </p>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
