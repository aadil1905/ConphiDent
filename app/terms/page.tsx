import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/platform";

export const metadata = { title: `Terms & Conditions | ${PLATFORM_NAME}` };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-slate-900">
      <Link href="/login" className="text-sm font-semibold text-primary hover:underline">← Back to sign in</Link>
      <h1 className="mt-6 text-4xl font-bold">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: 3 August 2026</p>
      <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
        <section><h2 className="text-xl font-bold text-slate-950">Use of this service</h2><p>{PLATFORM_NAME} provides secure workspaces to authorised clinic staff for appointments, patient records, treatment plans, invoices and communications. Keep sign-in details private and use the service only for legitimate clinic work.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950">Patient information</h2><p>Staff must enter accurate information and protect patient confidentiality. Access patient data only when needed for care or clinic operations. Do not share records or login access with unauthorised people.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950">Clinical and billing records</h2><p>Each clinic is responsible for reviewing its clinical notes, treatment plans, invoices, prices and payments before sharing them with patients. The software supports administration and does not replace professional clinical judgement.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950">WhatsApp communications</h2><p>Only send communications to confirmed patient phone numbers, with appropriate consent and in accordance with applicable WhatsApp policies.</p></section>
        <section><h2 className="text-xl font-bold text-slate-950">Contact</h2><p>Contact your clinic administrator for questions about your clinic data or access.</p></section>
      </div>
    </main>
  );
}
