import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity, ArrowRight, BarChart3, Bot, CalendarDays, Check, Download, FlaskConical,
  IndianRupee, MessagesSquare, Package, Scan, Sprout, Stethoscope, UsersRound,
} from "lucide-react";
import { Aurora, Lift, Reveal, Stagger, WordReveal } from "@/components/marketing/Motion";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Capabilities",
  description:
    "Every capability ConphiDent ships: patients and intake, appointments, clinical charting, treatment plans, prescriptions, billing, WhatsApp, CRM and follow-ups, laboratory, imaging, inventory, reporting, roles and exports.",
  alternates: { canonical: "/features" },
};

/** Grouped the way the product groups them, so the site and the app agree. */
const groups = [
  {
    icon: UsersRound, title: "Patients & intake",
    copy: "One record per patient, filled before they arrive.",
    items: [
      "Patient profiles with contact details, age and identifiers",
      "Medical history and allergy recording that clinical work reads from",
      "A shareable intake link the patient completes on their own phone",
      "Full visit history on the record, not in a separate log",
      "Case paper view for the whole patient story",
      "Search across patients from anywhere in the app",
    ],
  },
  {
    icon: CalendarDays, title: "Appointments & scheduling",
    copy: "A diary the whole clinic can trust.",
    items: [
      "Day and week views across providers and chairs",
      "Booking that carries patient, treatment, provider and chair together",
      "Conflict checking so two visits cannot claim the same slot",
      "Appointment status through the visit, from booked to completed",
      "Availability derived from your configured clinic hours",
      "Public booking links patients can use themselves",
    ],
  },
  {
    icon: Activity, title: "Clinical workspace",
    copy: "Charting, notes and plans on the record they belong to.",
    items: [
      "Full odontogram with tooth-level findings",
      "Dentition assessment for adult and mixed dentition",
      "Visit-linked clinical records and notes",
      "Treatment plans built from your own service list",
      "Encounter history that shows what happened and when",
      "Clinical corrections that are recorded rather than overwritten",
    ],
  },
  {
    icon: Stethoscope, title: "Prescriptions",
    copy: "Written by the prescriber, checked against the record.",
    items: [
      "Prescriptions issued against the patient's own record",
      "Allergy warnings raised from recorded medical history, including drug-class matches",
      "An acknowledgement gate before a flagged prescription can be issued",
      "Reusable prescription templates for common courses",
      "Prescriber identity carried by registration number and signature label",
      "Print-ready output that reads as directions, not as a database form",
    ],
  },
  {
    icon: IndianRupee, title: "Billing & payments",
    copy: "Money that stays attached to the care that earned it.",
    items: [
      "Patient-linked invoices with line items from your services",
      "Payment recording with running outstanding balance",
      "Receipts and transaction history on the patient record",
      "Your own invoice and receipt numbering prefixes",
      "Clinic billing identity: GSTIN, registration number, invoice footer",
      "Print-ready bills that lead with what is owed",
    ],
  },
  {
    icon: MessagesSquare, title: "WhatsApp",
    copy: "An automated receptionist plus a shared, accountable inbox.",
    items: [
      "Your own number via Meta's WhatsApp Cloud API",
      "Signature-verified inbound webhook with a durable event inbox",
      "AI receptionist grounded in your approved services and FAQs",
      "English, Hindi and Marathi, remembered per conversation",
      "Appointment booking and reminders from the same diary",
      "Scheduled outbox with delivery and failure visibility",
    ],
  },
  {
    icon: Sprout, title: "CRM, leads & follow-ups",
    copy: "One queue for everyone you still owe a reply.",
    items: [
      "Enquiries and callbacks in a single working queue",
      "Owners, filter counts and bulk selection",
      "Close reasons when a lead ends, with undo",
      "Converting an enquiry into a patient record",
      "Reopening a written-off enquiry when they come back",
      "Follow-up tasks with assignees and due dates",
    ],
  },
  {
    icon: FlaskConical, title: "Laboratory",
    copy: "Cases out with the lab, visible before they slip.",
    items: [
      "Patient-linked lab cases with material and shade",
      "Due dates, priority and a status timeline",
      "Rework tracking when a case comes back",
      "Laboratory records and per-case payments",
      "A revocable portal link for the lab itself",
      "Case attachments and messages kept with the case",
    ],
  },
  {
    icon: Scan, title: "Imaging & X-rays",
    copy: "Radiographs that live in the record, not on a machine.",
    items: [
      "Patient-linked imaging studies and assets",
      "Guided three-step add for a new X-ray",
      "Side-by-side comparison of studies over time",
      "Ordering and reviewing provider recorded on the study",
      "DICOM handling and derived display images",
      "Access-controlled private storage for clinical files",
    ],
  },
  {
    icon: Package, title: "Inventory & operations",
    copy: "Know what is running out before it runs out.",
    items: [
      "Inventory items with stock levels",
      "Stock movement ledger for what went in and out",
      "Expiry and low-stock awareness",
      "Purchase orders and vendor records",
      "The day sheet for operational work",
    ],
  },
  {
    icon: BarChart3, title: "Reports, insights & exports",
    copy: "Numbers built from the work you already did.",
    items: [
      "Appointment and revenue reporting",
      "Lead conversion and follow-up analytics",
      "Clinic performance overview",
      "Operational exports so your data can leave with you",
      "The morning huddle brief, printed as a sheet",
    ],
  },
  {
    icon: Bot, title: "AI Coach",
    copy: "Assistance grounded in your clinic, not in general advice.",
    items: [
      "Workflow assistance built on your approved clinic information",
      "Conversation support for the front desk",
      "No diagnostic claims and no autonomous clinical decisions",
    ],
  },
];

const roles = [
  ["Owner", "Everything, including clinic settings and staff"],
  ["Administrator", "Everything operational, including staff and billing identity"],
  ["Dentist", "Clinical work, charting, plans, prescriptions, imaging sign-off, lab approval"],
  ["Receptionist", "Diary, patients, billing, payments and WhatsApp"],
  ["Billing", "Invoices, payments and receipts"],
  ["Assistant", "Clinical support, charting, imaging upload, lab and diary"],
  ["Inventory", "Stock, movement and purchasing"],
  ["Auditor", "Activity records and exports, without clinical editing"],
  ["Lab", "Laboratory cases only"],
];

export default function Features() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">Capabilities</p></Reveal>
            <WordReveal className="t-display" text="Everything the clinic runs on, in one place." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                This is the full list of what ConphiDent ships today — grouped the way the product
                groups it. No invented features, no certifications we do not hold, and no
                performance figures we cannot stand behind.
              </p>
              <div className="mk-actions">
                <a href={SETUP_URL} className="mk-button">Start onboarding <ArrowRight /></a>
                <Link href="/product" className="mk-button-ghost">See it working</Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap">
          {/* The tiles below are h3. Without this the page jumped straight from
              the h1 to an h3, which leaves a screen reader announcing a level
              that never opened — and left the longest section on the page with
              nothing naming it. */}
          <Reveal>
            <p className="mk-kicker">Every capability</p>
            <h2 className="t-h2">Grouped the way the product groups them.</h2>
          </Reveal>
          <Stagger className="mk-bento">
            {groups.map((group) => (
              <Lift key={group.title} className="span-3">
                <span className="mk-tile-icon"><group.icon /></span>
                <h3>{group.title}</h3>
                <p>{group.copy}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}><Check />{item}</li>
                  ))}
                </ul>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">Who can do what</p>
            <h2 className="t-h2">Nine roles, each with its own reach.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              Permissions are part of the product rather than a paid add-on. Every page, action
              and API route checks the same permission set, so a role cannot be talked around
              by pasting in a link.
            </p>
            <div className="mk-actions">
              <Link href="/security" className="mk-text-link">How access control works <ArrowRight /></Link>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <dl className="mk-spec">
              {roles.map(([role, reach]) => (
                <div key={role}>
                  <dt>{role}</dt>
                  <dd>{reach}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Take it for a walk</p>
            <h2 className="t-h2">See these capabilities against your own clinic day.</h2>
            <p className="t-lead">
              Tell us how your clinic works now and we will walk the parts that matter to you —
              not a generic tour.
            </p>
            <div className="mk-actions">
              <Link href="/demo" className="mk-button">Book a demo <ArrowRight /></Link>
              <a href={SETUP_URL} className="mk-button-ghost">Start onboarding</a>
            </div>
            <p className="t-small" style={{ marginTop: 22, opacity: .75 }}>
              <Download style={{ width: 14, verticalAlign: "-2px", marginRight: 6 }} />
              Your data stays exportable for as long as you use ConphiDent.
            </p>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
