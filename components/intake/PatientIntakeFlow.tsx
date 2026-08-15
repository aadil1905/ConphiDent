"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import SignaturePad, { type SignaturePadHandle } from "./SignaturePad";

/** The Phase A medical-history list, as the clinic asks it at the desk. */
const CONDITIONS = [
  "Diabetes",
  "High blood pressure",
  "Heart problem",
  "Thyroid problem",
  "Asthma",
  "Bleeding disorder",
  "Epilepsy",
  "Hepatitis or jaundice",
  "Tuberculosis",
  "Kidney problem",
  "Pregnant or breastfeeding",
  "Smoking or tobacco use",
] as const;

const STEPS = ["Your details", "Your visit & history", "Consent & signature"] as const;

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
  "min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70";
const quietButton =
  "min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-sm font-semibold text-heading hover:bg-muted";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-card border border-border bg-card p-5 shadow-[var(--shadow)]">
      <h2 className="text-lg font-semibold text-heading">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The intake form in three short steps, styled as the original product was:
 * quiet section cards, the desk's own medical checklist, a drawn signature,
 * then "Send to clinic".
 */
export default function PatientIntakeFlow({
  token,
  patientName,
  patientPhone,
  visitLine,
}: IntakeFlowProps) {
  const padRef = useRef<SignaturePadHandle>(null);

  const [step, setStep] = useState(0);

  const [fullName, setFullName] = useState(patientName);
  const [phone, setPhone] = useState(patientPhone);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sex, setSex] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [problem, setProblem] = useState("");
  const [since, setSince] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState("");
  const [medication, setMedication] = useState("");

  const [consent, setConsent] = useState(false);
  const [whatsappOk, setWhatsappOk] = useState(false);
  const [signature, setSignature] = useState("");

  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const digits = phone.replace(/\D/g, "").replace(/^91/, "");

  const problemsFor = (which: number): string[] => {
    if (which === 0)
      return [
        fullName.trim().length < 2 && "your full name",
        digits.length !== 10 && "a 10-digit mobile number",
      ].filter((item): item is string => Boolean(item));
    if (which === 1)
      return [!problem.trim() && "what brings you in"].filter((item): item is string => Boolean(item));
    return [!consent && "the consent tick", !signature && "your signature"].filter(
      (item): item is string => Boolean(item),
    );
  };
  const problems = problemsFor(step);

  const next = () => {
    setTried(true);
    if (problemsFor(step).length) return;
    setTried(false);
    setStep((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    setTried(false);
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleCondition = (name: string) =>
    setConditions((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  const send = async () => {
    setTried(true);
    if (problemsFor(2).length) return;

    setSending(true);
    const stamp = new Date().toLocaleString("en-IN");
    try {
      const response = await fetch(`/api/public-intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicalHistory: conditions,
          drugAllergies: allergies,
          medications: medication,
          otherHistory: [
            `Told us their name is ${fullName.trim()}`,
            dateOfBirth && `Born ${dateOfBirth}`,
            sex && `Sex ${sex}`,
            `Mobile ${phone.trim()}`,
            email.trim() && `Email ${email.trim()}`,
            address.trim() && `Address ${address.trim()}`,
          ]
            .filter(Boolean)
            .join(". "),
          dentalHistory: [
            `Main problem: ${problem.trim()}`,
            since.trim() && `Started: ${since.trim()}`,
          ]
            .filter(Boolean)
            .join("\n"),
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
      <section className="flex flex-col items-center gap-4 rounded-card border border-border bg-card p-6 text-center shadow-[var(--shadow)]">
        <span className="grid h-14 w-14 place-items-center rounded-pill bg-success-bg text-success">
          <Check className="h-7 w-7" strokeWidth={2.6} aria-hidden />
        </span>
        <div>
          <h1 className="text-[22px] font-bold text-heading">
            Thank you, {fullName.split(" ")[0] || "you"}
          </h1>
          <p className="mt-1.5 text-[15px] text-foreground">
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
        <p className="mt-1.5 text-[13px] text-text-muted">
          Please fill this form. It takes about 3 minutes and the clinic will see it before you arrive.
          This link is valid for 7 days.
        </p>
        {visitLine && <p className="mt-2 text-[13px] text-foreground">{visitLine}</p>}
      </div>

      {/* Step indicator, in the same quiet voice as the rest of the page. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-3 text-[13px] text-text-muted">
          <span>
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
          <span>{step === 0 ? "about 2 minutes left" : step === 1 ? "about 1 minute left" : "nearly there"}</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
          className="h-2 overflow-hidden rounded-pill bg-[#d7e7eb]"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <Section title="Your details">
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
            <label className={label}>
              <span className={labelText}>Full name *</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                aria-invalid={tried && fullName.trim().length < 2}
                className={`${field} ${tried && fullName.trim().length < 2 ? "border-danger-mark" : ""}`}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Mobile number *</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91 98XXX XXXXX"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={tried && digits.length !== 10}
                className={`${field} tabular-nums ${tried && digits.length !== 10 ? "border-danger-mark" : ""}`}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Date of birth</span>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                className={field}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Sex</span>
              <select value={sex} onChange={(event) => setSex(event.target.value)} className={field}>
                <option value="">Choose…</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </label>
            <label className={label}>
              <span className={labelText}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                className={field}
              />
            </label>
            <label className={label}>
              <span className={labelText}>Address</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Area, city, PIN"
                autoComplete="street-address"
                className={field}
              />
            </label>
          </div>
        </Section>
      )}

      {step === 1 && (
        <>
          <Section title="Why are you coming in?">
            <label className={label}>
              <span className={labelText}>Main problem *</span>
              <textarea
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
                rows={3}
                placeholder="e.g. pain in lower left back tooth since 4 days"
                aria-invalid={tried && !problem.trim()}
                className={`resize-y rounded-control border bg-card px-3 py-2.5 text-sm text-foreground outline-none ${
                  tried && !problem.trim() ? "border-danger-mark" : "border-border"
                }`}
              />
            </label>
            <label className={label}>
              <span className={labelText}>When did it start?</span>
              <input
                value={since}
                onChange={(event) => setSince(event.target.value)}
                placeholder="e.g. 4 days ago"
                className={field}
              />
            </label>
          </Section>

          <Section title="Medical history">
            <p className="-mt-3 text-[13px] text-text-muted">Tick anything that applies to you.</p>
            <div className="grid gap-x-5 gap-y-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
              {CONDITIONS.map((name) => (
                <label key={name} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={conditions.includes(name)}
                    onChange={() => toggleCondition(name)}
                    className="h-[18px] w-[18px] accent-primary"
                  />
                  {name}
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
        </>
      )}

      {step === 2 && (
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
      )}

      {tried && problems.length > 0 && (
        <p
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
        {step > 0 && (
          <button type="button" onClick={back} className={quietButton}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={next} className={primaryButton}>
            Next
          </button>
        ) : (
          <button type="button" onClick={() => void send()} disabled={sending} className={primaryButton}>
            {sending ? "Sending…" : "Send to clinic"}
          </button>
        )}
      </div>
    </>
  );
}
