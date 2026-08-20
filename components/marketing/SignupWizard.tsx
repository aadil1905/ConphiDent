"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, EASE } from "./Motion";

type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "select" | "textarea";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
};

/**
 * Three short steps rather than one long form. Each step's fields are validated
 * before the next one opens, so an error is raised next to the field that
 * caused it while that field is still on screen.
 */
const STEPS: Array<{ title: string; blurb: string; fields: Field[] }> = [
  {
    title: "Your clinic",
    blurb: "So we can set the workspace up in your clinic's name.",
    fields: [
      { name: "clinicName", label: "Clinic name", required: true, placeholder: "e.g. Deepika Dental Care" },
      { name: "city", label: "City", required: true, placeholder: "e.g. Pune" },
      { name: "dentistCount", label: "How many dentists?", type: "select", required: true, options: ["1", "2–3", "4–6", "7–15", "16+"] },
      { name: "chairCount", label: "How many chairs?", type: "select", required: true, options: ["1", "2", "3–4", "5–8", "9+"] },
    ],
  },
  {
    title: "You",
    blurb: "We'll contact this person to run onboarding.",
    fields: [
      { name: "contactName", label: "Your name", required: true, placeholder: "Full name" },
      { name: "role", label: "Your role", type: "select", required: true, options: ["Owner", "Dentist", "Practice manager", "Administrator", "Receptionist", "Other"] },
      { name: "email", label: "Email", type: "email", required: true, placeholder: "you@clinic.com" },
      { name: "phone", label: "Phone", type: "tel", required: true, placeholder: "Mobile number" },
    ],
  },
  {
    title: "Your setup",
    blurb: "Optional, but it makes the first call far more useful.",
    fields: [
      { name: "whatsappNumber", label: "WhatsApp business number", type: "tel", placeholder: "The number patients message", hint: "Leave blank if you don't have one yet — we can help you get one." },
      { name: "currentSoftware", label: "What do you use today?", placeholder: "e.g. paper diary, Excel, another system" },
      { name: "priorities", label: "What hurts most right now?", type: "textarea", wide: true, placeholder: "e.g. we miss WhatsApp enquiries overnight and follow-ups get forgotten" },
    ],
  },
];

type Values = Record<string, string>;

export default function SignupWizard() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "error" | "success">("idle");
  const reduced = useReducedMotion();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function set(name: string, value: string) {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => {
      if (!previous[name]) return previous;
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }

  /** Validates only the step on screen, so errors stay next to their field. */
  function validateStep() {
    const found: Record<string, string> = {};
    for (const field of current.fields) {
      const value = (values[field.name] || "").trim();
      if (field.required && !value) found[field.name] = `${field.label} is required.`;
      else if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        found[field.name] = "Enter a valid email address.";
      } else if (field.type === "tel" && value && value.replace(/\D/g, "").length < 7) {
        found[field.name] = "Enter a valid phone number.";
      }
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit() {
    if (!validateStep()) return;
    setState("sending");
    const body = new FormData();
    for (const [key, value] of Object.entries(values)) body.append(key, value);
    body.append("companyWebsite", "");
    try {
      const result = await fetch("/api/clinic-signup", { method: "POST", body });
      setState(result.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="cf-form-success" role="status">
        <CheckCircle2 />
        <h3>You’re on the list.</h3>
        <p>
          We’ll be in touch within one working day to book your setup call and start
          on your workspace. Nothing is charged and nothing goes live until you say so.
        </p>
      </div>
    );
  }

  return (
    <div className="cf-wizard">
      <ol className="cf-wizard-rail" aria-label="Onboarding steps">
        {STEPS.map((item, index) => (
          <li key={item.title} className={index === step ? "is-on" : index < step ? "is-done" : ""}>
            <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>
            {item.title}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div
          key={current.title}
          initial={reduced ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
          transition={{ duration: 0.26, ease: EASE }}
        >
          <h2 className="t-h3" style={{ margin: 0 }}>{current.title}</h2>
          <p className="cf-form-note" style={{ marginTop: 6 }}>{current.blurb}</p>

          <div className="cf-form" style={{ boxShadow: "none", border: 0, padding: "22px 0 0" }}>
            {current.fields.map((field) => {
              const error = errors[field.name];
              const described = [field.hint ? `${field.name}-hint` : null, error ? `${field.name}-error` : null]
                .filter(Boolean).join(" ") || undefined;

              return (
                <label key={field.name} className={field.wide ? "cf-form-wide" : undefined}>
                  {field.label}{!field.required && <span className="cf-optional"> (optional)</span>}

                  {field.type === "select" ? (
                    <select
                      name={field.name}
                      value={values[field.name] || ""}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={described}
                      onChange={(event) => set(field.name, event.target.value)}
                    >
                      <option value="" disabled>Select an option</option>
                      {field.options?.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      name={field.name}
                      value={values[field.name] || ""}
                      placeholder={field.placeholder}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={described}
                      onChange={(event) => set(field.name, event.target.value)}
                    />
                  ) : (
                    <input
                      name={field.name}
                      type={field.type || "text"}
                      value={values[field.name] || ""}
                      placeholder={field.placeholder}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={described}
                      onChange={(event) => set(field.name, event.target.value)}
                    />
                  )}

                  {field.hint && !error && (
                    <span id={`${field.name}-hint`} className="cf-form-note">{field.hint}</span>
                  )}
                  {error && (
                    <span id={`${field.name}-error`} className="cf-field-error" role="alert">
                      <AlertCircle />{error}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      {state === "error" && (
        <p className="cf-form-error" role="alert" style={{ marginTop: 18 }}>
          <AlertCircle />
          We couldn&apos;t send that. Please try again, or email us and we&apos;ll set you up by hand.
        </p>
      )}

      <div className="cf-wizard-actions">
        {step > 0 && (
          <button type="button" className="mk-button-ghost" onClick={() => setStep((value) => value - 1)}>
            <ArrowLeft /> Back
          </button>
        )}
        {isLast ? (
          <button type="button" className="mk-button" disabled={state === "sending"} onClick={submit}>
            {state === "sending" ? "Sending…" : "Start onboarding"} <ArrowRight />
          </button>
        ) : (
          <button
            type="button"
            className="mk-button"
            onClick={() => { if (validateStep()) setStep((value) => value + 1); }}
          >
            Continue <ArrowRight />
          </button>
        )}
      </div>

      <p className="cf-form-note" style={{ marginTop: 16 }}>
        Please don&apos;t include patient information in this form. Nothing is charged and no
        workspace goes live until you have spoken to us.
      </p>
    </div>
  );
}
