"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { addPatientAction, type AddPatientResult } from "@/app/dashboard/patients/actions";
import { clearDraft, readDraft, saveDraft } from "@/lib/local-draft";

// The urgent-flag field is deliberately absent from anything written to the
// device — `saveDraft` strips it by name. See lib/local-draft.ts.
const DRAFT_NAME = "add-patient";
const FOCUSABLE = 'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Draft = { fullName: string; phone: string; age: string; flag: string; sendIntake: boolean };

const EMPTY: Draft = { fullName: "", phone: "", age: "", flag: "", sendIntake: true };

/**
 * "Add a patient" is a sheet inside Patients rather than its own route, so the
 * list you were looking at is still behind it when you are done.
 */
export default function AddPatientSheet({ whatsappOn }: { whatsappOn: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("add") === "1";

  return open ? <Sheet whatsappOn={whatsappOn} onClose={() => router.back()} router={router} /> : null;
}

function Sheet({
  whatsappOn,
  onClose,
  router,
}: {
  whatsappOn: boolean;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Starts empty, always. This used to seed itself from whatever draft the
  // device held, so on a shared machine the next person to open the sheet was
  // shown the previous patient's name, phone and urgent flag, unprompted. The
  // draft is now offered rather than applied.
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [offered, setOffered] = useState<{ value: Partial<Draft>; savedAt: Date } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Read on a scheduled tick rather than in the effect body. localStorage does
  // not exist on the server, so reading it as initial state made the two
  // renders disagree; and setting state straight from an effect is a render the
  // sheet does not need. BookAVisit already does it this way.
  useEffect(() => {
    const tick = setTimeout(() => {
      const saved = readDraft<Draft>(DRAFT_NAME);
      if (saved?.value.fullName) setOffered(saved);
    }, 0);
    return () => clearTimeout(tick);
  }, []);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const put = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    saveDraft(DRAFT_NAME, next);
  };

  const save = async (thenBook: boolean) => {
    setSaving(true);
    setError(null);
    const result: AddPatientResult = await addPatientAction({
      fullName: draft.fullName,
      phone: draft.phone,
      age: draft.age,
      flag: draft.flag,
      sendIntake: whatsappOn && draft.sendIntake,
    });
    setSaving(false);

    if (!result.ok) {
      setError({ message: result.message, field: result.field });
      return;
    }

    try {
      clearDraft(DRAFT_NAME);
    } catch {
      // Nothing to clean up.
    }
    toast.success(result.note);
    router.replace(
      thenBook ? `/dashboard/appointments/new?patient=${result.patientId}` : `/dashboard/patients/${result.patientId}`,
    );
  };

  const fieldClass = (name: string) =>
    `min-h-[46px] rounded-control border bg-card px-3 text-[15px] text-foreground ${
      error?.field === name ? "border-danger-mark" : "border-border"
    }`;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[var(--overlay)] backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 sm:items-center"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-patient-title"
        onClick={(event) => event.stopPropagation()}
        className="m-4 flex w-full max-w-[560px] flex-col gap-3.5 rounded-card border border-border-strong bg-card p-5.5 shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 id="add-patient-title" className="text-lg font-semibold text-heading">
              Add a patient
            </h2>
            <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              Four fields now — the rest can wait until they are in the chair.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid min-h-11 w-11 cursor-pointer place-items-center rounded-control text-heading hover:bg-muted"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        {/* Offered, never applied. The sheet used to fill itself from whatever
            draft the device held, which on a shared machine meant the last
            patient's details appeared for whoever opened it next. Naming the
            patient and the time is what makes a wrong one obvious. */}
        {offered && !dismissed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border bg-muted px-3.5 py-2.5">
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              You started adding <span className="font-semibold text-heading">{offered.value.fullName}</span> at{" "}
              {offered.savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
            <div className="flex flex-none gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...EMPTY, ...offered.value });
                  setDismissed(true);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold text-heading hover:bg-muted"
              >
                Pick it up
              </button>
              <button
                type="button"
                onClick={() => {
                  clearDraft(DRAFT_NAME);
                  setDismissed(true);
                }}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-control px-3 text-[13px] font-semibold text-text-muted hover:bg-muted"
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Full name</span>
            <input
              value={draft.fullName}
              onChange={(event) => put("fullName", event.target.value)}
              placeholder="e.g. Kavya Menon"
              aria-invalid={error?.field === "fullName"}
              autoComplete="off"
              className={fieldClass("fullName")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Mobile number</span>
            <input
              value={draft.phone}
              onChange={(event) => put("phone", event.target.value)}
              placeholder="+91 98XXX XXXXX"
              inputMode="tel"
              aria-invalid={error?.field === "phone"}
              className={`${fieldClass("phone")} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Age</span>
            <input
              value={draft.age}
              onChange={(event) => put("age", event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 24"
              inputMode="numeric"
              aria-invalid={error?.field === "age"}
              className={`${fieldClass("age")} tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Anything urgent to flag</span>
            <input
              value={draft.flag}
              onChange={(event) => put("flag", event.target.value)}
              placeholder="Optional — allergy, pregnancy, diabetes"
              className={fieldClass("flag")}
            />
          </label>
        </div>

        {whatsappOn && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={draft.sendIntake}
              onChange={(event) => put("sendIntake", event.target.checked)}
              className="h-[18px] w-[18px] accent-primary"
            />
            <span>Send the intake form on WhatsApp so they fill the rest in</span>
          </label>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-control border border-danger-border bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} aria-hidden />
            <span>{error.message}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="min-h-[46px] cursor-pointer rounded-control border border-primary bg-primary px-5.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
          >
            {saving ? "Saving…" : "Save patient"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="min-h-[46px] cursor-pointer rounded-control border border-border-strong bg-card px-4 text-sm font-semibold text-heading hover:bg-muted disabled:opacity-70"
          >
            Save and book a visit
          </button>
        </div>
      </div>
    </div>
  );
}
