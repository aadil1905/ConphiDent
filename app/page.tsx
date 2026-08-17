import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity, ArrowRight, BarChart3, CalendarDays, Check, CheckCircle2, FlaskConical,
  IndianRupee, MessagesSquare, Package, Scan, ShieldCheck, Siren, Sprout, Stethoscope,
  UsersRound, X,
} from "lucide-react";
import { Aurora, Lift, Parallax, Reveal, Stagger, StaggerChild, Tilt, WordReveal } from "@/components/marketing/Motion";
import PlatformExplorer from "@/components/marketing/PlatformExplorer";
import { ProductVisual } from "@/components/marketing/ProductVisuals";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";
import WhatsAppThread from "@/components/marketing/WhatsAppThread";
import { tenantFromRequestHost } from "@/lib/platform";

export const metadata: Metadata = {
  // Spelled out in full rather than relying on the root layout's "%s |
  // ConphiDent" template: a title template applies to child segments, never to
  // the segment that declares it, and `app/page.tsx` sits in the same segment
  // as `app/layout.tsx`. The homepage was therefore the one page on the site
  // whose <title> carried no brand at all.
  title: "Dental clinic management software | ConphiDent",
  description:
    "ConphiDent is the connected operating system for modern dental clinics — WhatsApp automation, appointments, patient records, dental charting, prescriptions, billing, laboratory, imaging, inventory and reporting in one workspace.",
  alternates: { canonical: "/" },
};

/**
 * Structured data.
 *
 * Deliberately thin: `aggregateRating`, `review` and `offers` are the fields
 * that earn rich results, and every one of them would have to be invented —
 * there are no verified ratings, reviews or published prices. Google penalises
 * fabricated review markup, and the inventory records that no testimonials or
 * statistics exist. What is here is checkable against the site itself.
 */
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.conphident.live/#organization",
      name: "ConphiDent",
      url: "https://www.conphident.live/",
      logo: "https://www.conphident.live/conphident-logo-transparent.png",
      description: "Clinic management software for dental practices.",
      areaServed: "IN",
    },
    {
      "@type": "SoftwareApplication",
      name: "ConphiDent",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Dental practice management software",
      operatingSystem: "Web browser",
      url: "https://www.conphident.live/",
      publisher: { "@id": "https://www.conphident.live/#organization" },
      description:
        "ConphiDent connects WhatsApp, appointments, patient records, dental charting, prescriptions, billing, laboratory, imaging, inventory and reporting on one patient record.",
      inLanguage: ["en", "hi", "mr"],
      featureList: [
        "WhatsApp automation and shared inbox",
        "Appointment scheduling with conflict checks",
        "Patient records and shareable intake links",
        "Tooth-level dental charting",
        "Treatment plans and prescriptions",
        "Invoicing and payment recording",
        "Laboratory case tracking",
        "Imaging and side-by-side comparison",
        "Inventory and purchase orders",
        "Reporting and exports",
      ],
    },
  ],
};

/** The thirteen modules in FEATURE_REGISTRY, named the way the app names them. */
const modules = [
  { icon: UsersRound, title: "Patients & intake", copy: "Profiles, medical history, allergies and a shareable intake link that fills the record before the visit.", span: "span-3" },
  { icon: CalendarDays, title: "Appointments", copy: "A diary that carries the patient, the treatment, the provider and the chair — with conflict checks on booking.", span: "span-3" },
  { icon: Activity, title: "Clinical workspace", copy: "Tooth-level charting on a full odontogram, visit-linked clinical notes, treatment plans and prescriptions with allergy warnings.", span: "span-4" },
  { icon: MessagesSquare, title: "WhatsApp", copy: "An automated receptionist, a shared inbox and a scheduled outbox you can audit.", span: "span-2" },
  { icon: IndianRupee, title: "Billing", copy: "Patient-linked invoices, payment recording, receipts and outstanding balances.", span: "span-2" },
  { icon: Sprout, title: "CRM & follow-ups", copy: "One queue over enquiries and callbacks, with owners, close reasons and undo.", span: "span-2" },
  { icon: FlaskConical, title: "Laboratory", copy: "Cases out with the lab: material, shade, due date, priority, status timeline and rework.", span: "span-2" },
  { icon: Scan, title: "Imaging", copy: "Patient-linked radiographs, upload and review, and side-by-side comparison.", span: "span-3" },
  { icon: Package, title: "Inventory & operations", copy: "Stock items, movement, expiry and low-stock awareness, purchase orders and vendors.", span: "span-3" },
  { icon: BarChart3, title: "Reports & analytics", copy: "Appointment, revenue, lead and follow-up reporting built from connected records, plus operational exports.", span: "span-4" },
  { icon: ShieldCheck, title: "AI Coach", copy: "AI-assisted workflow support grounded in your own approved clinic information.", span: "span-2" },
];

/**
 * Each of these is a line in `lib/prompts.ts`, which is the system prompt the
 * assistant actually runs under. Nothing here describes intent or roadmap.
 */
const aiBounds = [
  {
    icon: Stethoscope,
    title: "It does not diagnose or prescribe",
    copy: "No diagnosis, no medicines, no antibiotics, no guaranteed outcomes. Clinical judgement stays with your qualified team.",
  },
  {
    icon: Siren,
    title: "Emergencies go to a person",
    copy: "Severe swelling, uncontrolled bleeding, facial injury, difficulty breathing or a knocked-out tooth all get the same answer: seek immediate care.",
  },
  {
    icon: IndianRupee,
    title: "It cannot invent commercial terms",
    copy: "No made-up prices, no imagined insurance cover, no EMI offers, no promotions, and no doctor availability your clinic has not configured.",
  },
  {
    icon: CalendarDays,
    title: "It never says a slot is held",
    copy: "A time is only ever described as reserved once the booking flow has actually confirmed it against the diary.",
  },
  {
    icon: ShieldCheck,
    title: "It answers from your approved list",
    copy: "Services, fees, timings and FAQ answers come from your own clinic configuration — not from the model's general knowledge of dentistry.",
  },
  {
    icon: MessagesSquare,
    title: "The thread is kept",
    copy: "Every conversation stays on the record for continuity and review, so a handover to a human starts with the full context.",
  },
];

const without = [
  "Enquiries scattered across personal WhatsApp accounts",
  "A paper diary the rest of the clinic cannot see",
  "Clinical notes that never reach the bill",
  "Follow-ups nobody owns",
  "Lab cases tracked on a whiteboard",
  "Month-end guesswork instead of numbers",
];

const with_ = [
  "One inbox, with every enquiry owned and answerable",
  "A shared diary with conflict checks",
  "Charting, plans and invoices on one record",
  "A follow-up queue with owners and close reasons",
  "Lab cases with due dates and status",
  "Reporting built from the work you already did",
];

export default async function Home() {
  // A recognised clinic subdomain is a private workspace entry point, not a
  // second copy of the ConphiDent marketing site.
  if (await tenantFromRequestHost()) redirect("/login");

  return (
    <PublicShell>
      <script
        type="application/ld+json"
        // The object is authored above and contains no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal>
              <p className="mk-kicker">The operating system for modern dental clinics</p>
            </Reveal>
            <WordReveal className="t-display" text="Every part of your clinic, finally working together." />
            <Reveal delay={0.15}>
              <p className="t-lead">
                ConphiDent connects WhatsApp, appointments, patient records, clinical charting,
                billing, laboratory work, imaging, inventory and follow-up in one workspace —
                so nothing about a patient lives in a second place.
              </p>
              <div className="mk-actions">
                <a href={SETUP_URL} className="mk-button">Start onboarding <ArrowRight /></a>
                <Link href="/demo" className="mk-button-ghost">Book a demo</Link>
              </div>
              <div className="mk-trust-line">
                <span><CheckCircle2 /> Built for Indian dental practices</span>
                <span><CheckCircle2 /> English, Hindi and Marathi on WhatsApp</span>
                <span><CheckCircle2 /> Your clinic’s data stays your clinic’s</span>
              </div>
            </Reveal>
          </div>

          {/* Two axes of depth on the one element that earns it: the scroll
              gives it distance from the copy, the pointer gives it a camera.
              Both are decorative — no text or control is moved by either. */}
          <Parallax className="mk-hero-frame" distance={26}>
            <Tilt max={6}>
              <ProductVisual kind="today" caption="Interface illustration · the day as the clinic opens it" />
            </Tilt>
          </Parallax>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading is-centered">
              <p className="mk-kicker">From first message to next visit</p>
              <h2 className="t-h2">The clinic journey should be one continuous system.</h2>
              <p className="t-lead">
                A patient’s first WhatsApp message, their appointment, their chart, their bill,
                their lab case and their follow-up are all the same story. ConphiDent keeps them
                on the same record.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mk-flow" aria-label="Patient journey">
              {["Enquiry", "Appointment", "Consultation", "Charting", "Treatment", "Payment", "Lab", "Follow-up"].map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Everything in one workspace</p>
              <h2 className="t-h2">Eleven destinations. One patient record underneath.</h2>
              <p className="t-lead">
                These are the modules the product ships today — each one gated by your own
                role permissions, each one writing to the same connected record.
              </p>
            </div>
          </Reveal>

          <Stagger className="mk-bento">
            {modules.map((item) => (
              <Lift key={item.title} className={item.span}>
                <span className="mk-tile-icon"><item.icon /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section on-ink" id="whatsapp-preview">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">WhatsApp automation</p>
            <h2 className="t-h2">Your clinic answers in seconds, at 11pm, in three languages.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              Every message to your clinic number arrives through Meta’s WhatsApp Cloud API,
              is signature-verified, and gets answered from information you approved — your
              services, your fees, your timings. Bookings go straight into the diary. Anything
              sensitive stops and waits for a human.
            </p>
            <ul className="mk-ticklist">
              {[
                "Replies grounded only in your approved services and FAQs",
                "English, Hindi and Marathi, chosen by the patient",
                "Appointment booking, reminders and a scheduled outbox",
                "Billing and clinical questions handed to your team, never guessed",
              ].map((line) => (
                <li key={line}><Check />{line}</li>
              ))}
            </ul>
            <div className="mk-actions">
              <Link href="/whatsapp" className="mk-button">See how the automation works <ArrowRight /></Link>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <WhatsAppThread />
          </Reveal>
        </div>
      </section>

      <PlatformExplorer />

      <section className="mk-section">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading is-centered">
              <p className="mk-kicker">How the automation is bounded</p>
              <h2 className="t-h2">The limits are written down, not left to its judgement.</h2>
              <p className="t-lead" style={{ marginTop: 18 }}>
                An assistant that answers patients has to be wrong in safe directions. These
                constraints are instructions the model runs under on every message, not a policy
                page — and they are the same on the first message of the day and the four
                hundredth.
              </p>
            </div>
          </Reveal>

          <Stagger className="mk-grid-3" step={0.06}>
            {aiBounds.map((bound) => (
              <Lift key={bound.title}>
                <span className="mk-tile-icon"><bound.icon /></span>
                <h3>{bound.title}</h3>
                <p>{bound.copy}</p>
              </Lift>
            ))}
          </Stagger>

          <Reveal delay={0.1}>
            <p className="mk-legal-note" style={{ marginTop: 28, textAlign: "center" }}>
              It answers from the services, prices and opening hours you approved. Asked anything
              outside them, it says a team member will confirm and offers an appointment rather
              than guessing.{" "}
              <Link href="/whatsapp" className="mk-text-link">See what it will and will not do <ArrowRight /></Link>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading is-centered">
              <p className="mk-kicker">A calmer operating model</p>
              <h2 className="t-h2">What changes on the first day.</h2>
            </div>
          </Reveal>
          <Stagger className="mk-compare">
            <StaggerChild as="article">
              <p className="mk-compare-label"><X /> Without ConphiDent</p>
              {without.map((line) => <div key={line}><X />{line}</div>)}
            </StaggerChild>
            <StaggerChild as="article" className="is-good">
              <p className="mk-compare-label"><Check /> With ConphiDent</p>
              {with_.map((line) => <div key={line}><Check />{line}</div>)}
            </StaggerChild>
          </Stagger>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Built for real clinics</p>
              <h2 className="t-h2">Nine roles. Twenty-two permissions. One clinic’s data.</h2>
              <p className="t-lead">
                A receptionist should not open a clinical note. A dentist should not have to ask
                for the diary. ConphiDent ships role-based access, per-clinic data isolation and
                activity records as part of the product, not as an upgrade.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-grid-3">
            {[
              ["Role-based access", "Owner, administrator, dentist, receptionist, billing, assistant, inventory, auditor and lab — each with its own permissions."],
              ["Per-clinic isolation", "Every record is scoped to the clinic that owns it, across every workflow in the product."],
              ["Activity records", "Audit records support operational traceability for sensitive actions."],
              ["Signed WhatsApp ingress", "Webhook requests are HMAC signature-verified before anything is persisted."],
              ["Encrypted credentials", "WhatsApp connection credentials are stored encrypted, per clinic."],
              ["Your data, exportable", "Operational exports let you take your data out whenever you want it."],
            ].map(([title, copy]) => (
              <Lift key={title}>
                <ShieldCheck />
                <h3>{title}</h3>
                <p>{copy}</p>
              </Lift>
            ))}
          </Stagger>
          <Reveal delay={0.1}>
            <div className="mk-actions">
              <Link href="/security" className="mk-text-link">Read how security works <ArrowRight /></Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Get your clinic running on it</p>
            <h2 className="t-h2">Onboarding takes a conversation, not a project.</h2>
            <p className="t-lead">
              Start onboarding and we’ll set up your workspace, add your treatments and fees,
              connect your WhatsApp number, and train your team before you go live.
            </p>
            <div className="mk-actions">
              <a href={SETUP_URL} className="mk-button">Start onboarding <ArrowRight /></a>
              <Link href="/demo" className="mk-button-ghost">Book a demo first</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
