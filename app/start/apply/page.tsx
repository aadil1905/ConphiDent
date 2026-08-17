import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Aurora, Reveal } from "@/components/marketing/Motion";
import PublicShell from "@/components/marketing/PublicShell";
import SignupWizard from "@/components/marketing/SignupWizard";

export const metadata: Metadata = {
  title: "Start onboarding",
  description: "Tell us about your dental clinic and we will set up your ConphiDent workspace.",
  alternates: { canonical: "/start/apply" },
};

export default function ApplyPage() {
  return (
    <PublicShell>
      <section className="mk-hero" style={{ paddingBottom: "var(--s-4)" }}>
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <Link href="/start" className="mk-text-link" style={{ marginBottom: 20 }}>
              <ArrowLeft /> Back to onboarding
            </Link>
            <h1 className="t-h1" style={{ marginTop: 14 }}>Tell us about your clinic.</h1>
            <p className="t-lead" style={{ maxWidth: 620, marginTop: 16 }}>
              Three short steps. We will come back to you within one working day to book your
              setup call — nothing is charged and no workspace goes live until you have spoken
              to us.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mk-section" style={{ paddingTop: 0 }}>
        <div className="cf-wrap mk-panel" style={{ alignItems: "start" }}>
          <Reveal>
            <div className="mk-aside">
              <p className="mk-kicker">While you are here</p>
              <h2 className="t-h3" style={{ marginTop: 14 }}>What we do with this</h2>
              <ul className="mk-ticklist">
                <li><Check /> A member of our team reads it — it does not go into an autoresponder.</li>
                <li><Check /> We use it to prepare your workspace before the call, so the call is short.</li>
                <li><Check /> It creates no account and charges nothing.</li>
                <li><Check /> We never ask for patient information at this stage.</li>
              </ul>
              <p className="t-small" style={{ marginTop: 22 }}>
                Prefer to talk first? <Link href="/demo" className="mk-text-link" style={{ display: "inline-flex" }}>Book a demo instead</Link>
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <SignupWizard />
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
