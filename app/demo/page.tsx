import type { Metadata } from "next";
import { CheckCircle2, MessageCircle } from "lucide-react";
import DemoForm from "@/components/marketing/DemoForm";
import { Aurora, Reveal, WordReveal } from "@/components/marketing/Motion";
import PublicShell from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Book a demo",
  description: "See ConphiDent's connected patient, appointment, clinical, billing, WhatsApp and operations workflows on a focused walkthrough.",
  alternates: { canonical: "/demo" },
};

const whatsappHref = process.env.NEXT_PUBLIC_WHATSAPP_URL || "#demo-request";

export default function Demo() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">Book a walkthrough</p></Reveal>
            <WordReveal className="t-display" text="See how ConphiDent fits your clinic." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                Tell us how your clinic works now. We will walk the workflows that matter to your
                team rather than running a generic tour.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section id="demo-request" className="mk-section on-tint" style={{ scrollMarginTop: 90 }}>
        <div className="cf-wrap mk-panel" style={{ alignItems: "start" }}>
          <Reveal>
            <p className="mk-kicker">Request a demo</p>
            <h2 className="t-h2">A practical tour, not a sales deck.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              The walkthrough can focus on intake, scheduling, clinical charting, billing,
              WhatsApp automation, laboratory work, imaging or reporting — whichever is costing
              you the most time right now.
            </p>
            <ul className="mk-ticklist">
              <li><CheckCircle2 /> We review your request</li>
              <li><CheckCircle2 /> We contact you at the time you prefer</li>
              <li><CheckCircle2 /> We demonstrate the workflows relevant to you</li>
            </ul>
            <a href={whatsappHref} className="mk-text-link" style={{ marginTop: 26 }}>
              <MessageCircle /> Prefer WhatsApp? Start there.
            </a>
          </Reveal>

          <Reveal delay={0.1}>
            <DemoForm />
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
