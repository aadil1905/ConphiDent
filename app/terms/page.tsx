import type { Metadata } from "next";
import Link from "next/link";
import PublicShell from "@/components/marketing/PublicShell";
import { PLATFORM_NAME } from "@/lib/platform";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms under which dental clinics and their staff use ConphiDent.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicShell>
      <section className="mk-page-hero mk-legal-hero">
        <div className="cf-wrap">
          <p className="mk-kicker">Legal</p>
          <h1>Terms of service</h1>
          <p>The terms under which clinics and their staff use {PLATFORM_NAME}.</p>
        </div>
      </section>

      <section className="mk-legal">
        <div className="cf-wrap">
          <h2>Use of this service</h2>
          <p>
            {PLATFORM_NAME} provides secure workspaces to authorised clinic staff for appointments,
            patient records, treatment plans, invoices and communications. Keep sign-in details
            private and use the service only for legitimate clinic work.
          </p>

          <h2>Patient information</h2>
          <p>
            Staff must enter accurate information and protect patient confidentiality. Access
            patient data only when needed for care or clinic operations. Do not share records or
            sign-in access with unauthorised people.
          </p>

          <h2>Clinical and billing records</h2>
          <p>
            Each clinic is responsible for reviewing its clinical notes, treatment plans, invoices,
            prices and payments before sharing them with patients. The software supports
            administration and does not replace professional clinical judgement.
          </p>

          <h2>WhatsApp communications</h2>
          <p>
            Only send communications to confirmed patient phone numbers, with appropriate consent
            and in accordance with applicable WhatsApp policies. A recipient may reply STOP or
            UNSUBSCRIBE to stop non-essential messages, and START to opt in again.
          </p>

          <h2>Availability and changes</h2>
          <p>
            We may update the service and these terms as the product develops. Material changes
            will be communicated to clinic owners. Continued use after a change means the updated
            terms apply.
          </p>

          <h2>Contact</h2>
          <p>
            For questions about your clinic&rsquo;s data or access, contact your clinic
            administrator. For anything else, email{" "}
            <a href="mailto:contact@conphident.live">contact@conphident.live</a>, or read our{" "}
            <Link href="/privacy">privacy policy</Link> and{" "}
            <Link href="/security">security overview</Link>.
          </p>

          <p className="mk-legal-note">Last updated: 16 August 2026.</p>
        </div>
      </section>
    </PublicShell>
  );
}
