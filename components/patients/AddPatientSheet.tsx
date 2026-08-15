"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, X } from "lucide-react";
import { toast } from "sonner";
import { addPatientAction, type AddPatientResult } from "@/app/dashboard/patients/actions";

const DRAFT_KEY = "conphident.add-patient.draft";
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
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
    } catch {
      return EMPTY;
    }
  });
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
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // Losing a draft is better than losing the click.
    }
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
      localStorage.removeItem(DRAFT_KEY);
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
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[rgba(18,59,93,0.35)] backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 sm:items-center"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-patient-title"
        onClick={(event) => event.stopPropagation()}
        className="m-4 flex w-full max-w-[560px] flex-col gap-3.5 rounded-card border border-border-strong bg-card p-4.5 shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 id="add-patient-title" className="text-lg font-semibold text-heading">
              Add a patient
            </h2>
            <p className="mt-1 text-[13px] text-text-muted">
              Four fields now — the rest can wait until they are in the chair.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid min-h-10 w-10 cursor-pointer place-items-center rounded-control text-heading hover:bg-muted"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

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
            className="min-h-[46px] cursor-pointer rounded-control border border-primary bg-primary px-4.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
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
