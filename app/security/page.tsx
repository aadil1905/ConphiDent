import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Download, FileClock, KeyRound, Lock, ShieldCheck, UserCog } from "lucide-react";
import { Aurora, Lift, Reveal, Stagger, StaggerChild, WordReveal } from "@/components/marketing/Motion";
import PublicShell, { SETUP_URL } from "@/components/marketing/PublicShell";

export const metadata: Metadata = {
  title: "Security & data",
  description:
    "How ConphiDent protects clinic data: per-clinic isolation, nine roles and twenty-two permissions, encrypted WhatsApp credentials, signature-verified webhooks, access-controlled clinical files, activity records and data export.",
  alternates: { canonical: "/security" },
};

/**
 * The order is not editorial. It is the order `lib/tenant.ts` applies:
 * requireApiUser -> can(role, permission) -> hasFeature(clinicId, feature),
 * then the scoped query, then the audit write. The status codes are the ones
 * the routes really return.
 */
const gates = [
  {
    step: "Session",
    copy: "No valid session, no request. An account still owing a password change is stopped here too, before it can read anything.",
    rejects: "401",
  },
  {
    step: "Role",
    copy: "Twenty-two permissions across nine roles, checked on the server for pages, server actions and API routes alike — never in the browser, where it could be skipped.",
    rejects: "403",
  },
  {
    step: "Module",
    copy: "A clinic that has not enabled a module cannot reach it even with the right role. Entitlement and permission are separate questions and both are asked.",
    rejects: "403",
  },
  {
    step: "Clinic",
    copy: "Every read and write carries the clinic resolved from the session, so a record belonging to another practice is not addressable from this one.",
    rejects: "no rows",
  },
  {
    step: "Record",
    copy: "Sensitive actions write an audit row naming who did it and when. Clinical corrections supersede rather than overwrite, so the original stays readable.",
    rejects: "kept",
  },
];

const controls = [
  { icon: Building2, title: "Every record belongs to one clinic", copy: "Clinic context is resolved from the request and applied across the product's workflows. One clinic's patients, invoices, messages and images are not reachable from another clinic's session." },
  { icon: UserCog, title: "Role-based access, enforced server-side", copy: "Nine clinic roles and twenty-two permissions. The check runs on the server for pages, actions and API routes alike — not in the browser, where it could simply be skipped." },
  { icon: KeyRound, title: "Encrypted WhatsApp credentials", copy: "The tokens that let us send on your behalf are stored encrypted and scoped to your clinic. They are never exposed to the browser." },
  { icon: Lock, title: "Signature-verified webhooks", copy: "Inbound WhatsApp traffic is verified against an HMAC-SHA256 signature before anything is persisted. An unsigned request is rejected outright." },
  { icon: FileClock, title: "Activity records", copy: "Sensitive actions write audit records, so there is an operational trail of who did what. Clinical corrections are recorded rather than silently overwriting the original." },
  { icon: Download, title: "Your data can leave", copy: "Operational exports are part of the product. Choosing ConphiDent does not mean your clinic's history becomes hostage to it." },
];

const accountControls = [
  ["Authentication", "Staff sign in with their own account. Sessions are cookie-based and server-verified on every protected request."],
  ["Failed attempts", "Repeated failed sign-ins increment a counter and can lock the account for a period."],
  ["Password resets", "Reset tokens are single-purpose and time-limited, delivered by email."],
  ["Forced rotation", "An administrator can require a staff member to change their password at next sign-in."],
  ["Clinical files", "Radiographs and private clinical documents are held in access-controlled storage, reached through short-lived authorised links rather than public URLs."],
  ["Laboratory portal", "External labs get a revocable link scoped to their own cases — not an account inside your clinic."],
];

export default function SecurityPage() {
  return (
    <PublicShell>
      <section className="mk-hero">
        <Aurora />
        <div className="cf-wrap">
          <div className="mk-hero-copy">
            <Reveal><p className="mk-kicker">Security &amp; data</p></Reveal>
            <WordReveal className="t-display" text="Patient data deserves a straight answer." />
            <Reveal delay={0.12}>
              <p className="t-lead">
                This page describes controls that exist in the product today. Where something is
                an operational practice rather than a certification, we say so — a dental clinic
                choosing software should not have to decode marketing language to find out what
                is actually protecting its patients.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Controls in the product</p>
              <h2 className="t-h2">What protects your clinic’s data.</h2>
            </div>
          </Reveal>
          <Stagger className="mk-grid-3">
            {controls.map((item) => (
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
        <div className="cf-wrap">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">How a request is checked</p>
              <h2 className="t-h2">Five gates, in this order, on every request.</h2>
              <p className="t-lead">
                Not a policy — the sequence the code runs. A request that fails any one of them
                never reaches the next.
              </p>
            </div>
          </Reveal>
          <Stagger className="mk-gates" as="ul" step={0.07}>
            {gates.map((gate, index) => (
              <StaggerChild key={gate.step} as="li" className="mk-gate">
                <span className="mk-gate-index" aria-hidden="true">{index + 1}</span>
                <div>
                  <h3>{gate.step}</h3>
                  <p>{gate.copy}</p>
                </div>
                <span className="mk-gate-code">{gate.rejects}</span>
              </StaggerChild>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mk-section">
        <div className="cf-wrap mk-panel">
          <Reveal>
            <p className="mk-kicker">Accounts &amp; files</p>
            <h2 className="t-h2">The details underneath.</h2>
            <p className="t-lead" style={{ marginTop: 18 }}>
              The parts of the system most likely to be asked about in a procurement
              conversation, stated plainly.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <dl className="mk-spec">
              {accountControls.map(([term, copy]) => (
                <div key={term}><dt>{term}</dt><dd>{copy}</dd></div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Tinted so it does not run into "The details underneath." above it —
          two plain sections in a row leave 178px of undifferentiated white
          where a section boundary is supposed to be. */}
      <section className="mk-section on-tint">
        <div className="cf-wrap cf-wrap-narrow">
          <Reveal>
            <div className="mk-section-heading">
              <p className="mk-kicker">Being straight with you</p>
              <h2 className="t-h2">What we do not claim.</h2>
            </div>
            <dl className="mk-spec">
              <div>
                <dt>No certification claims</dt>
                <dd>We do not hold or claim ISO 27001, SOC 2, HIPAA certification or regulatory clearance. If a certification matters to your practice, ask us where we are before you buy, not after.</dd>
              </div>
              <div>
                <dt>No clinical claims</dt>
                <dd>ConphiDent does not diagnose, does not make autonomous clinical decisions and does not claim diagnostic accuracy. Clinical judgement remains with your qualified team.</dd>
              </div>
              <div>
                <dt>Demonstration data is fictional</dt>
                <dd>Every example, patient name and figure shown across this site is invented for demonstration. None of it comes from a real clinic.</dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="mk-final">
        <Aurora />
        <div className="cf-wrap">
          <Reveal>
            <p className="mk-kicker">Questions before you commit</p>
            <h2 className="t-h2">Ask us the hard ones.</h2>
            <p className="t-lead">
              We would rather answer a difficult security question on a call than have you find
              the answer later.
            </p>
            <div className="mk-actions">
              <Link href="/demo" className="mk-button">Talk to us <ArrowRight /></Link>
              <a href={SETUP_URL} className="mk-button-ghost">Start onboarding</a>
            </div>
            <p className="t-small" style={{ marginTop: 24, opacity: .8 }}>
              <ShieldCheck style={{ width: 14, verticalAlign: "-2px", marginRight: 6 }} />
              See also our <Link href="/privacy" style={{ color: "inherit", textDecoration: "underline" }}>privacy policy</Link> and{" "}
              <Link href="/data-deletion" style={{ color: "inherit", textDecoration: "underline" }}>data deletion process</Link>.
            </p>
          </Reveal>
        </div>
      </section>
    </PublicShell>
  );
}
