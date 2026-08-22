"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";

import { CURRENT_CONDITION_KEYS, MEDICAL_CONDITIONS } from "@/lib/medical-history";

export type IntakeFlowProps = {
  token: string;
  patientName: string;
  patientPhone: string;
  visitLine: string | null;
  clinicName: string;
  directionsUrl: string | null;
};

const field =
  "min-h-11 rounded-control border border-border bg-card px-3 text-sm text-foreground outline-none";
const label = "flex flex-col gap-1.5";
const labelText = "text-xs font-semibold text-heading";
const primaryButton =
  "min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-card border border-border bg-card p-5 shadow-[var(--shadow)]">
      <h2 className="text-lg font-semibold text-heading">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One page, and only the part only the patient can answer. Who they are and
 * why they're coming in is taken down by staff beforehand now (at the desk,
 * or before the link goes out) — this page shows that back as a read-only
 * confirmation, and collects exactly two more things: their own health
 * history, and their own signature.
 */
export default function PatientIntakeFlow({
  patientName,
  patientPhone,
  token,
  visitLine,
}: IntakeFlowProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  const [conditions, setConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [medication, setMedication] = useState("");

  const [consent, setConsent] = useState(false);
  const [whatsappOk, setWhatsappOk] = useState(false);
  const [signature, setSignature] = useState("");

  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const fullName = patientName;
  const phone = patientPhone;

  const problems = [
    !consent && "the consent tick",
    !signature && "your signature",
  ].filter((item): item is string => Boolean(item));

  const toggleCondition = (name: string) =>
    setConditions((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  // The alert and the invalid controls (consent tick, signature) all sit at
  // the bottom of this one-page form, right above the button that was just
  // tapped — scrolling to the top on failure carried the error out of view
  // instead of pointing at it, so a rejected tap looked like a no-op. Runs
  // after the alert actually mounts, not inside send() itself: `tried` only
  // becomes true there, so the ref is still null on that same tick.
  useEffect(() => {
    if (tried && problems.length > 0) alertRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [tried, problems.length]);

  const send = async () => {
    setTried(true);
    if (problems.length) return;

    setSending(true);
    const stamp = new Date().toLocaleString("en-IN");
    try {
      const response = await fetch(`/api/public-intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicalHistory: conditions,
          // What was on screen, so the printed sheet can tick Yes and No
          // honestly rather than guessing which list this patient answered.
          medicalHistoryAsked: CURRENT_CONDITION_KEYS,
          drugAllergies: allergies,
          medications: medication,
          // Who they are and their date of birth/gender are taken down by
          // staff at the desk now, straight onto the patient record — this
          // page never collects them, so there is nothing to send here.
          consentGiven: true,
          consentNotes: [
            `Signed by hand on ${stamp}`,
            whatsappOk
              ? "Agreed to appointment reminders and clinic updates on WhatsApp"
              : "Did not tick the WhatsApp updates box",
          ].join(". "),
          patientSignature: signature,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "That didn't send.");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `${error.message} Nothing was lost — try again.`
          : "That didn't send — your connection dropped. Nothing was lost; try again.",
      );
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <section className="mx-auto flex w-full max-w-[36rem] flex-col items-center gap-4 rounded-card border border-border bg-card p-6 text-center shadow-[var(--shadow)]">
        <span className="grid h-14 w-14 place-items-center rounded-pill bg-success-bg text-success">
          <Check className="h-7 w-7" strokeWidth={2.6} aria-hidden />
        </span>
        <div>
          <h1 className="text-[22px] font-bold text-heading">
            Thank you, {fullName.split(" ")[0] || "you"}
          </h1>
          <p className="mt-1.5 text-[length:var(--text-body)] text-foreground">
            The clinic will read this before you arrive. You can close this page.
          </p>
        </div>
        {visitLine && <p className="rounded-control bg-muted px-3.5 py-3 text-sm">{visitLine}</p>}
      </section>
    );
  }

  return (
    <>
      <div>
        <h1 className="text-[28px] leading-tight font-bold text-heading">Before your visit</h1>
        <p className="mt-1.5 text-[length:var(--text-secondary)] text-text-muted">
          One page — about 3 minutes — and the clinic will see it before you arrive. This link is
          valid for 7 days.
        </p>
        {visitLine && <p className="mt-2 text-[length:var(--text-secondary)] text-foreground">{visitLine}</p>}
      </div>

      {/* Read-only: the clinic took this down already. Shown so whoever is
          signing — the patient on their own phone, or at the desk — can catch
          a typo before they sign, not so it can be edited here. */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-muted p-4 text-sm">
        <span className="font-semibold text-heading">{fullName}</span>
        <span className="tabular-nums text-text-muted">{phone}</span>
      </section>

      <Section title="Medical history">
        <p className="-mt-3 text-[length:var(--text-secondary)] text-text-muted">Tick anything that applies to you.</p>
        <div className="grid gap-x-5 gap-y-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
          {/* Asked in plain English, stored as the stable key. The printed
              consent sheet renders the same rows in the clinic's own clinical
              wording — one list, two labels. */}
          {MEDICAL_CONDITIONS.map((condition) => (
            <label key={condition.key} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={conditions.includes(condition.key)}
                onChange={() => toggleCondition(condition.key)}
                className="h-[18px] w-[18px] accent-primary"
              />
              {condition.patient}
            </label>
          ))}
        </div>
        <label className={label}>
          <span className={labelText}>Allergies</span>
          <input
            value={allergies}
            onChange={(event) => setAllergies(event.target.value)}
            placeholder="e.g. penicillin, latex"
            className={field}
          />
        </label>
        <label className={label}>
          <span className={labelText}>Current medication</span>
          <textarea
            value={medication}
            onChange={(event) => setMedication(event.target.value)}
            rows={2}
            placeholder="Medicines you take regularly"
            className="resize-y rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none"
          />
        </label>
      </Section>

      <Section title="Consent">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={tried && !consent}
            className="mt-[3px] h-[18px] w-[18px] accent-primary"
          />
          <span>
            I confirm the information above is correct and I consent to examination and treatment at
            this clinic.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={whatsappOk}
            onChange={(event) => setWhatsappOk(event.target.checked)}
            className="mt-[3px] h-[18px] w-[18px] accent-primary"
          />
          <span>I agree to receive appointment reminders and clinic updates on WhatsApp.</span>
        </label>
        <div className="flex flex-col gap-2">
          <span className={labelText}>Signature *</span>
          <SignaturePad ref={padRef} onChange={setSignature} invalid={tried && !signature} />
          <span className="text-xs text-text-muted">
            Sign with your finger or mouse in the box above.
          </span>
        </div>
      </Section>

      {tried && problems.length > 0 && (
        <p
          ref={alertRef}
          role="alert"
          className="flex items-start gap-2.5 rounded-control border border-danger-border bg-danger-bg px-3.5 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-[18px] w-[18px] flex-none" strokeWidth={2.2} aria-hidden />
          <span>
            We still need{" "}
            {problems.length === 1
              ? problems[0]
              : `${problems.slice(0, -1).join(", ")} and ${problems[problems.length - 1]}`}
            .
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-2.5 pb-6">
        <button type="button" onClick={() => void send()} disabled={sending} className={primaryButton}>
          {sending ? "Sending…" : "Send to clinic"}
        </button>
      </div>
    </>
  );
}
