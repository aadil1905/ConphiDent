"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Values = {
  fullName: string;
  phone: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
  medicalNotes?: string | null;
};

type PatientResponse = {
  id?: number;
  existed?: boolean;
  error?: string;
  issues?: { fieldErrors?: Record<string, string[]> };
};

type FieldName = "fullName" | "phone" | "email";

const DRAFT_KEY = "conphident.patient.draft";

function firstIssue(body: PatientResponse) {
  const fields = body.issues?.fieldErrors;
  return fields ? Object.values(fields).flat()[0] : null;
}

const field = (bad: boolean) =>
  `min-h-11 w-full rounded-control border bg-white px-3 text-sm text-foreground outline-none ${
    bad ? "border-danger-mark" : "border-border"
  }`;

export default function PatientForm({
  patient,
  mode = "create",
}: {
  patient?: Values & { id: number };
  mode?: "create" | "edit";
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<{ field?: FieldName; text: string }[]>([]);

  const has = (name: FieldName) => problems.some((problem) => problem.field === name);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) || "").trim();
    const data = {
      fullName: text("fullName"),
      phone: String(form.get("phone") || "").replace(/\D/g, "").slice(-10),
      email: text("email"),
      dateOfBirth: text("dateOfBirth"),
      gender: text("gender"),
      address: text("address"),
      medicalNotes: text("medicalNotes"),
    };

    // Errors sit against the field and are repeated above the button, so
    // nobody has to hunt for what is missing.
    const found: { field?: FieldName; text: string }[] = [];
    if (data.fullName.length < 2) found.push({ field: "fullName", text: "We need a name to put on the file." });
    if (data.phone.length !== 10) found.push({ field: "phone", text: "A mobile number is 10 digits." });
    if (found.length) {
      setProblems(found);
      return;
    }

    setSaving(true);
    setProblems([]);

    try {
      const response = await fetch(
        mode === "create" ? "/api/patients" : `/api/patients/${patient?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const body = (await response.json().catch(() => ({}))) as PatientResponse;
      if (!response.ok) throw new Error(firstIssue(body) || body.error || "That didn't save.");

      const patientId = mode === "create" ? body.id : patient?.id;
      if (!patientId) throw new Error("It saved, but we could not open the file.");

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up.
      }

      const firstName = data.fullName.split(" ")[0] || data.fullName;
      toast.success(
        body.existed
          ? `${firstName} already had that number — opening their file.`
          : mode === "create"
            ? `${firstName} is on your list.`
            : "Saved.",
      );
      router.push(`/dashboard/patients/${patientId}`);
      router.refresh();
    } catch (error) {
      const text =
        error instanceof Error && error.message
          ? error.message
          : "That didn't save — your connection dropped. Nothing was lost; try again.";
      setProblems([{ text }]);
      toast.error(text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]"
    >
      <div className="border-b border-border px-4.5 py-4">
        <h2 className="text-base font-semibold text-heading">
          {mode === "create" ? "Who are they?" : "Their details"}
        </h2>
        <p className="mt-1 text-[13px] text-text-muted">
          A name and a mobile number is enough to start. The rest can wait until they are in the chair.
        </p>
      </div>

      <div className="flex flex-col gap-5 p-4.5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Full name</span>
            <input
              required
              name="fullName"
              autoComplete="name"
              defaultValue={patient?.fullName}
              placeholder="e.g. Kavya Menon"
              aria-invalid={has("fullName")}
              className={field(has("fullName"))}
            />
            {has("fullName") && (
              <span className="text-[13px] text-danger">
                {problems.find((problem) => problem.field === "fullName")?.text}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Mobile number</span>
            <input
              required
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={patient?.phone}
              placeholder="+91 98XXX XXXXX"
              aria-invalid={has("phone")}
              className={`${field(has("phone"))} tabular-nums`}
            />
            {has("phone") ? (
              <span className="text-[13px] text-danger">
                {problems.find((problem) => problem.field === "phone")?.text}
              </span>
            ) : (
              <span className="text-xs text-text-muted">This is how reminders and receipts reach them.</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={patient?.email ?? ""}
              placeholder="Optional"
              className={field(has("email"))}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Date of birth</span>
            <input
              name="dateOfBirth"
              type="date"
              defaultValue={patient?.dateOfBirth?.slice(0, 10) ?? ""}
              className={`${field(false)} tabular-nums`}
            />
            <span className="text-xs text-text-muted">Some doses depend on age.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Sex</span>
            <select name="gender" defaultValue={patient?.gender ?? ""} className={field(false)}>
              <option value="">Not said</option>
              <option>Female</option>
              <option>Male</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">Address</span>
            <input
              name="address"
              defaultValue={patient?.address ?? ""}
              placeholder="Optional"
              className={field(false)}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-heading">Anything to read before treating them</span>
          <textarea
            name="medicalNotes"
            rows={5}
            defaultValue={patient?.medicalNotes ?? ""}
            placeholder="Allergies, pregnancy, diabetes, blood thinners, anything that changes what is safe"
            className="rounded-control border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none"
          />
          <span className="text-xs text-text-muted">
            This shows in red at the top of their file, so nobody misses it.
          </span>
        </label>

        {problems.length > 0 && (
          <p
            role="alert"
            className="flex items-start gap-2.5 rounded-control border border-danger-border bg-danger-bg px-3.5 py-3 text-[13px] text-danger"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" strokeWidth={2.2} aria-hidden />
            <span>
              {problems.length === 1
                ? problems[0].text
                : `Two things still need fixing: ${problems.map((problem) => problem.text.replace(/\.$/, "").toLowerCase()).join(", and ")}.`}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2.5 border-t border-border bg-muted px-4.5 py-3.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={saving}
          className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-5 text-[13px] font-semibold text-heading hover:bg-muted disabled:opacity-70"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 cursor-pointer rounded-control border border-primary bg-primary px-6 text-[13px] font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
        >
          {saving ? "Saving…" : mode === "create" ? "Add them" : "Save"}
        </button>
      </div>
    </form>
  );
}
