import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock, ArrowRight, BadgeCheck, Ban, CalendarCheck, Check, Clock,
  Globe, Inbox, KeyRound, Languages, ListChecks, Lock, MessageCircle,
  ShieldAlert, ShieldCheck, Signal, UserCog,
} from "lucide-react";
import { Aurora, Lift, Reveal, Stagger, WordReveal } from "@/components/marketing/Motion";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";
import WhatsAppThread from "@/components/marketing/WhatsAppThread";

export const metadata: Metadata = {
  title: "WhatsApp automation for dental clinics",
  description:
    "How ConphiDent answers your clinic's WhatsApp: an AI receptionist grounded in your approved services and fees, English, Hindi and Marathi, appointment booking, reminders, a scheduled outbox with delivery status, and safety rules that hand clinical and billing questions to your team.",
  alternates: { canonical: "/whatsapp" },
};

const pipeline = [
  { icon: MessageCircle, title: "A patient messages your clinic number", copy: "The number is your own WhatsApp Business number, connected through Meta's WhatsApp Cloud API. Patients use the app they already have — nothing to install, no new link to remember." },
  { icon: Lock, title: "The request is signature-verified", copy: "Every webhook call is checked against an HMAC-SHA256 signature before a single byte is trusted. An unsigned or mismatched request is rejected with a 401 and never reaches your clinic's data." },
  { icon: Inbox, title: "The message is written down before it is acted on", copy: "The event is persisted to a durable inbox and acknowledged to Meta immediately, then processed. If processing fails, the message is still recorded and a recovery sweep picks it up — a busy moment cannot lose an enquiry." },
  { icon: UserCog, title: "It is routed to the right clinic", copy: "The phone number ID on the event decides which clinic the message belongs to. One disconnected clinic in a batch never blocks the others, and no message can land in another clinic's inbox." },
  { icon: Languages, title: "The patient picks a language", copy: "English, Hindi or Marathi. The choice is remembered for the conversation, so a patient who answered in Hindi keeps being answered in Hindi." },
  { icon: BadgeCheck, title: "The reply comes from what you approved", copy: "Your treatments, your fees, your FAQs, your timings, your clinical team. If the answer is not in your approved information, the assistant says a team member will confirm — it does not fill the gap itself." },
];

const answers = [
  ["Treatments and fees", "Answers from your service list with the listed price, or explains that the fee depends on assessment when no price is set."],
  ["Clinic contact and timings", "Address, phone, email and opening hours, in the language the patient chose."],
  ["Which dentists practise here", "Names your active clinical team, then routes the patient to booking because schedules change."],
  ["Your own FAQs", "Any question and approved answer you have configured, matched against what the patient actually typed."],
  ["Booking an appointment", "Offers real times and hands the confirmation back to the clinic. It never claims a slot is held until the booking flow confirms it."],
  ["Anything else", "Says a clinic team member will confirm, and offers an appointment rather than guessing."],
];

const guardrails = [
  { icon: Ban, title: "It never diagnoses or prescribes", copy: "No diagnosis, no medicines, no antibiotics, no guarantees about outcomes. Clinical judgement stays with your qualified team, and the assistant is instructed to say so." },
  { icon: ShieldAlert, title: "Emergencies are escalated, not handled", copy: "Severe swelling, uncontrolled bleeding, facial injury, difficulty breathing or a knocked-out tooth all get an immediate instruction to seek emergency dental care." },
  { icon: Lock, title: "Billing details stop at the door", copy: "The assistant will not read out invoices, balances or payment history in chat. It asks the patient to type \"human\" so your team can verify who they are speaking to first." },
  { icon: Ban, title: "It cannot invent commercial terms", copy: "No made-up prices, no imagined insurance cover, no EMI offers, no promotions and no doctor availability that your clinic has not configured." },
  { icon: UserCog, title: "A human is always one word away", copy: "Any patient can ask for a person and land in the shared inbox, where a named member of your team owns the conversation." },
  { icon: KeyRound, title: "You can switch it off", copy: "Inbound automation is a per-clinic control. Turn it off and every message simply arrives in the inbox for your team to answer by hand." },
];

const outbound = [
  { icon: AlarmClock, title: "Appointment reminders", copy: "Scheduled ahead of the visit so the chair is not left empty, and recorded against the appointment they belong to." },
  { icon: ListChecks, title: "Follow-up workflows", copy: "Recall and follow-up messages run from the same queue your follow-up tasks live in, so the message and the task never disagree." },
  { icon: Clock, title: "A scheduled outbox", copy: "Everything queued to go out is visible before it sends — what, to whom, and when." },
  { icon: Signal, title: "Delivery and failure visibility", copy: "Delivery statuses come back from Meta onto the message, so a failure is something you can see and retry rather than something you discover from an empty waiting room." },
];

const setup = [
  { title: "Connect your number", copy: "Your WhatsApp Business number is connected through Meta's Embedded Signup. Credentials are stored encrypted and scoped to your clinic alone." },
  { title: "Load your approved information", copy: "Treatments and fees, opening hours, address, your clinical team, and the FAQs you want answered automatically." },
  { title: "Verify with Meta", copy: "Business verification runs on Meta's side. We track it with you through onboarding so nothing stalls silently." },
  { title: "Test it end to end", copy: "Message the number yourself, walk the booking flow, and confirm a reminder lands before a single patient sees it." },
  { title: "Go live", copy: "Automation switches on. Your team keeps the inbox, and the assistant handles the repetitive half of it." },
];

export default function WhatsAppPage() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-panel" style={{ alignItems: "center" }}>
            <div>
              <Reveal><p className="mk-kicker">WhatsApp automation</p></Reveal>
              <WordReveal className="t-display" text="The receptionist who never goes home." />
              <Reveal delay={0.12}>
                <p className="t-lead" style={{ marginTop: 22 }}>
                  Most dental enquiries arrive on WhatsApp, and most of them arrive after the clinic
                  has closed. ConphiDent answers them in seconds — in English, Hindi or Marathi —
                  using only the treatments, fees and timings you approved, and books the appointment
                  straight into your diary.
                </p>
                <div className="mk-actions">
                  <a href={SETUP_URL} className="mk-button">Connect your number <ArrowRight /></a>
                  <Link href="/demo" className="mk-button-ghost">See it on a call</Link>
                </div>
              </Reveal>
            </div>
            <Reveal delay={0.18}><WhatsAppThread /></Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">How a message travels</p>
              <h2 className="t-h2">Six steps from a patient’s phone to your diary.</h2>
              <p className="t-lead">
                Nothing here is a black box. This is the path every inbound message actually takes.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-grid-3">
            {pipeline.map((step) => (
              <Lift key={step.title}>
                <span className="mk-tile-icon"><step.icon /></span>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">Grounded answers</p>
            <h2 className="t-h2">It only knows what you told it.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              The assistant is not left to improvise about your clinic. Its answers are built from
              your configured services, fees, FAQs, opening hours and clinical team — and when a
              question falls outside that, it says so and offers an appointment instead of
              inventing something plausible.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <dl className="mk-spec">
              {answers.map(([term, copy]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{copy}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="mk-section on-ink">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Where it deliberately stops</p>
              <h2 className="t-h2">The safety rules matter more than the clever answers.</h2>
              <p className="t-lead">
                An automated assistant in a dental clinic can do real harm if it is allowed to
                guess. These limits are written into the assistant’s instructions, not left to
                its judgement.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-grid-3">
            {guardrails.map((item) => (
              <Lift key={item.title}>
                <span className="mk-tile-icon"><item.icon /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Outbound</p>
              <h2 className="t-h2">The messages you send are accountable too.</h2>
              <p className="t-lead">
                Reminders and follow-ups are only worth sending if you can tell whether they
                arrived. Everything outbound is queued, visible and status-tracked.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-grid-2">
            {outbound.map((item) => (
              <Lift key={item.title}>
                <span className="mk-tile-icon"><item.icon /></span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </Lift>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section on-tint">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">Languages</p>
            <h2 className="t-h2">Answer patients in the language they wrote in.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              The first reply offers English, हिन्दी and मराठी. Whatever the patient picks is
              remembered for that conversation — menus, service lists, clinic timings and contact
              details all follow the choice.
            </p>
            <ul className="mk-ticklist">
              <li><Globe /> English</li>
              <li><Globe /> हिन्दी — Hindi</li>
              <li><Globe /> मराठी — Marathi</li>
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <ol className="mk-steps">
              {setup.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Get it answering</p>
            <h2 className="t-h2">Your number, answering properly, this month.</h2>
            <p className="t-lead">
              We connect the number, load your treatments and fees, run it past Meta verification
              and test it with you before a single patient sees an automated reply.
            </p>
            <div className="mk-actions">
              <a href={SETUP_URL} className="mk-button">Start onboarding <ArrowRight /></a>
              <Link href="/security" className="mk-button-ghost">How we handle your data</Link>
            </div>
            <ul className="mk-ticklist" style={{ maxWidth: 440, margin: "28px auto 0", textAlign: "left" }}>
              <li><Check /> Your own WhatsApp Business number</li>
              <li><Check /> Credentials stored encrypted, per clinic</li>
              <li><ShieldCheck /> Automation you can switch off at any time</li>
              <li><CalendarCheck /> Bookings land in the same diary your team uses</li>
            </ul>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
