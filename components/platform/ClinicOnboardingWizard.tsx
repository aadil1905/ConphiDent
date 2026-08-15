"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Check,
  CheckCircle2,
  Circle,
  Cloud,
  CloudOff,
  Edit3,
  LockKeyhole,
  Save,
  ShieldCheck,
} from "lucide-react";

const steps = [
  {
    name: "Organization",
    group: "Organization",
    required: ["name", "ownerName", "ownerEmail", "password"],
  },
  { name: "Branding", group: "Organization", required: ["brandName"] },
  {
    name: "Location",
    group: "Organization",
    required: ["locationName", "timezone"],
  },
  { name: "Doctors & staff", group: "Operations", required: [] },
  { name: "Hours", group: "Operations", required: [] },
  { name: "Services", group: "Operations", required: ["serviceName"] },
  { name: "WhatsApp", group: "Integrations", required: [] },
  { name: "Features", group: "Integrations", required: ["featureKey"] },
  {
    name: "Subscription",
    group: "Commercial",
    required: ["subscriptionStatus"],
  },
  { name: "Domain & access", group: "Launch", required: ["slug"] },
  { name: "Review & activate", group: "Launch", required: [] },
] as const;
const groups = [
  "Organization",
  "Operations",
  "Integrations",
  "Commercial",
  "Launch",
] as const;
const services = [
  "Dentures",
  "Implants",
  "Root Canals",
  "Braces",
  "Aesthetic Dentistry",
  "Kids Dentistry",
  "Gum Treatment",
  "Extractions",
  "Surgeries",
  "X-Ray",
];
const features = [
  "patients",
  "appointments",
  "clinical",
  "billing",
  "crm",
  "follow_ups",
  "whatsapp",
  "laboratory",
  "inventory",
  "reports",
  "analytics",
  "ai_coach",
];
type DraftValues = Record<string, string | string[]>;
type DraftAction = (formData: FormData) => Promise<{ draftId: string }>;
type PreflightAction = (
  formData: FormData,
) => Promise<{ ok: boolean; issues: string[]; checkedAt?: string }>;
function formValues(form: HTMLFormElement, includePassword = false) {
  const data = new FormData(form);
  if (!includePassword) data.delete("password");
  const result: DraftValues = {};
  for (const [key, value] of data.entries()) {
    if (key === "draftId" || key.startsWith("activation")) continue;
    const text = String(value);
    const current = result[key];
    result[key] =
      current === undefined
        ? text
        : Array.isArray(current)
          ? [...current, text]
          : [current, text];
  }
  return result;
}

export function ClinicOnboardingWizard({
  action,
  saveDraft,
  preflight,
  plans,
  initialDraft,
}: {
  action: (formData: FormData) => void | Promise<void>;
  saveDraft: DraftAction;
  preflight: PreflightAction;
  plans: { id: number; name: string }[];
  initialDraft?: {
    draftId: string;
    values: DraftValues;
    updatedAt: string;
    step: number;
  };
}) {
  const seed = initialDraft;
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef(seed?.draftId || "");
  const saveQueueRef = useRef<Promise<boolean> | null>(null);
  const [step, setStep] = useState(() =>
    Math.min(Math.max(seed?.step || 0, 0), steps.length - 1),
  );
  const [draftId, setDraftId] = useState(seed?.draftId || "");
  const [values, setValues] = useState<DraftValues>(seed?.values || {});
  const [draftState, setDraftState] = useState(
    seed
      ? `Draft restored${seed.updatedAt ? ` · ${new Date(seed.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}`
      : "Draft will save automatically",
  );
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState("");
  const [completed, setCompleted] = useState<boolean[]>(() =>
    steps.map((item, index) => {
      if (!seed || index > seed.step) return false;
      if (!item.required.length) return true;
      return item.required.every(
        (name) =>
          name !== "password" &&
          Boolean(seed.values[name]) &&
          (!Array.isArray(seed.values[name]) ||
            (seed.values[name] as string[]).length > 0),
      );
    }),
  );
  const [activateText, setActivateText] = useState("");
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [preflightState, setPreflightState] = useState<
    "idle" | "checking" | "passed" | "failed"
  >("idle");
  const [preflightIssues, setPreflightIssues] = useState<string[]>([]);

  const restore = (form: HTMLFormElement | null) => {
    if (!form || form.dataset.restored) return;
    form.dataset.restored = "true";
    for (const [name, value] of Object.entries(seed?.values || {})) {
      const elements = Array.from(form.elements).filter(
        (element) => (element as HTMLInputElement).name === name,
      ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
      for (const element of elements) {
        if (
          element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
        )
          element.checked = (Array.isArray(value) ? value : [value]).includes(
            element.value,
          );
        else if (!Array.isArray(value)) element.value = value;
      }
    }
  };
  const stepComplete = (index: number) => {
    const form = formRef.current;
    if (!form) return completed[index];
    if (!steps[index].required.length) return index <= step;
    return steps[index].required.every((name) => {
      const matches = Array.from(form.elements).filter(
        (item) => (item as HTMLInputElement).name === name,
      ) as HTMLInputElement[];
      return matches.some((item) =>
        item.type === "checkbox"
          ? item.checked
          : Boolean(item.value.trim()) && item.checkValidity(),
      );
    });
  };
  const refreshCompletion = () => {
    const next = steps.map((_, index) => stepComplete(index));
    setCompleted(next);
    return next;
  };
  const focusStep = (index: number) => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-step="${index}"] h3`)
        ?.focus();
    });
  };
  const persist = async (nextStep = step) => {
    if (autosaveRef.current) {
      clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    }
    const previous = saveQueueRef.current ?? Promise.resolve(true);
    const operation = previous
      .catch(() => false)
      .then(async () => {
        const form = formRef.current;
        if (!form) return false;
        const safeValues = formValues(form);
        const payload = new FormData();
        for (const [key, value] of Object.entries(safeValues))
          for (const item of Array.isArray(value) ? value : [value])
            payload.append(key, item);
        payload.set("draftId", draftIdRef.current);
        payload.set("currentStep", String(nextStep));
        setValues(safeValues);
        setSaving(true);
        setDraftState("Saving non-secret draft…");
        try {
          const saved = await saveDraft(payload);
          draftIdRef.current = saved.draftId;
          setDraftId(saved.draftId);
          setDraftState(
            `Saved · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
          );
          return true;
        } catch {
          setDraftState("Draft save failed · retry available");
          return false;
        } finally {
          setSaving(false);
        }
      });
    saveQueueRef.current = operation;
    try {
      return await operation;
    } finally {
      if (saveQueueRef.current === operation) saveQueueRef.current = null;
    }
  };
  const validateCurrent = () => {
    const container = formRef.current?.querySelector<HTMLElement>(
      `[data-step="${step}"]`,
    );
    const fields = Array.from(
      container?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input,select,textarea") || [],
    );
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      setStepError(
        "Complete the highlighted required field before continuing.",
      );
      return false;
    }
    if (!stepComplete(step)) {
      setStepError("Complete at least one selection before continuing.");
      return false;
    }
    setStepError("");
    return true;
  };
  const goNext = async () => {
    if (!validateCurrent()) return;
    const nextStep = Math.min(step + 1, steps.length - 1);
    refreshCompletion();
    await persist(nextStep);
    setStep(nextStep);
    focusStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrevious = async () => {
    const nextStep = Math.max(step - 1, 0);
    refreshCompletion();
    await persist(nextStep);
    setStep(nextStep);
    focusStep(nextStep);
  };
  const editStep = async (index: number) => {
    setPreflightState("idle");
    await persist(index);
    setStep(index);
    focusStep(index);
  };
  const changed = (event: React.FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name || "";
    if (name.startsWith("activation")) return;
    setPreflightState("idle");
    setPreflightIssues([]);
    setDraftState("Unsaved changes");
    refreshCompletion();
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      void persist(step);
    }, 1200);
  };
  const allComplete = completed.slice(0, -1).every(Boolean);
  const percent = Math.round(
    (completed.slice(0, -1).filter(Boolean).length / (steps.length - 1)) * 100,
  );
  const summary = (key: string, fallback = "Not provided") => {
    const value = values[key];
    return Array.isArray(value)
      ? `${value.length} selected`
      : value || fallback;
  };
  const runPreflight = async () => {
    const completion = refreshCompletion();
    if (!completion.slice(0, -1).every(Boolean) || !stepComplete(0)) {
      setPreflightState("failed");
      setPreflightIssues([
        "Complete every required step and re-enter the temporary password.",
      ]);
      return;
    }
    if (!(await persist(10))) {
      setPreflightState("failed");
      setPreflightIssues(["Draft could not be saved before preflight."]);
      return;
    }
    const form = formRef.current;
    if (!form) return;
    const payload = new FormData(form);
    payload.set("draftId", draftIdRef.current);
    setPreflightState("checking");
    setPreflightIssues([]);
    try {
      const result = await preflight(payload);
      setPreflightState(result.ok ? "passed" : "failed");
      setPreflightIssues(result.issues);
    } catch {
      setPreflightState("failed");
      setPreflightIssues([
        "Preflight could not complete. Your non-secret draft is safe; retry when the connection is available.",
      ]);
    }
  };

  return (
    <section className="overflow-visible rounded-2xl border bg-card shadow-sm">
      <div className="border-b p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="platform-eyebrow">Enterprise deployment</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--heading)]">
              Clinic provisioning wizard
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dependencies are validated step by step. Only non-secret
              configuration is autosaved.
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <PlatformSaveState
                saving={saving}
                failed={draftState.includes("failed")}
              />
              <b className="text-sm text-primary">{percent}% complete</b>
            </div>
            <div
              role="progressbar"
              aria-label="Provisioning completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p
              aria-live="polite"
              className="mt-2 text-xs text-muted-foreground"
            >
              {draftState}
            </p>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside
          aria-label="Provisioning progress"
          className="border-b bg-muted/25 p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div className="mb-4 rounded-xl border bg-background p-3">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="text-muted-foreground">
                Step {step + 1} of {steps.length}
              </span>
              <span className="text-primary">{percent}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {completed.slice(0, -1).filter(Boolean).length} of{" "}
              {steps.length - 1}
              configuration steps ready
            </p>
          </div>
          {groups.map((group) => (
            <div key={group} className="mb-4 last:mb-0">
              <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">
                {group}
              </p>
              {steps.map(
                (item, index) =>
                  item.group === group && (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() =>
                        index <= step || completed[index]
                          ? void editStep(index)
                          : undefined
                      }
                      disabled={index > step && !completed[index]}
                      aria-current={index === step ? "step" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-semibold ${index === step ? "bg-primary text-white" : completed[index] ? "text-emerald-700 hover:bg-emerald-50" : "text-muted-foreground disabled:opacity-55"}`}
                    >
                      {completed[index] ? (
                        <CheckCircle2 className="size-4 shrink-0" />
                      ) : (
                        <Circle className="size-4 shrink-0" />
                      )}
                      <span>{item.name}</span>
                    </button>
                  ),
              )}
            </div>
          ))}
        </aside>
        <form
          ref={(node) => {
            formRef.current = node;
            restore(node);
          }}
          action={action}
          onChange={changed}
          onSubmit={(event) => {
            const completion = refreshCompletion();
            if (
              !completion.slice(0, -1).every(Boolean) ||
              preflightState !== "passed" ||
              activateText !== "ACTIVATE" ||
              !activationConfirmed
            ) {
              event.preventDefault();
              setStepError(
                "Server preflight must pass, the activation acknowledgement must be selected, and ACTIVATE must be typed exactly.",
              );
            }
          }}
          className="min-w-0 p-5 lg:p-7"
        >
          <input type="hidden" name="draftId" value={draftId} />
          <StepPanel
            index={0}
            step={step}
            title="Organization and initial owner"
            description="The owner password remains in this browser session only and is never included in draft saves."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Legal clinic name" name="name" />
              <Field label="First owner name" name="ownerName" />
              <Field label="Owner email" name="ownerEmail" type="email" />
              <Field
                label="Temporary owner password"
                name="password"
                type="password"
                minLength={12}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
                title="Use at least 12 characters with upper- and lower-case letters plus a number."
                autoComplete="new-password"
              />
              <SecurityNote>
                Temporary passwords are excluded from browser recovery and
                server draft storage. Preflight validates the password only in
                transit; re-enter it after any refresh or resume. Use at least
                12 characters with upper- and lower-case letters plus a number.
              </SecurityNote>
            </div>
          </StepPanel>
          <StepPanel
            index={1}
            step={step}
            title="Branding"
            description="Set the patient-facing identity. Media remains in the governed Blob workflow after creation."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Display brand name" name="brandName" />
              <SecurityNote>
                Logo upload remains available in Clinic 360° and updates the
                canonical Clinic record.
              </SecurityNote>
            </div>
          </StepPanel>
          <StepPanel
            index={2}
            step={step}
            title="Primary location"
            description="Locale and time zone drive scheduling and patient communications."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Primary branch name" name="locationName" />
              <Field
                label="Branch phone"
                name="locationPhone"
                required={false}
              />
              <Field
                label="Branch address"
                name="locationAddress"
                className="md:col-span-2"
                required={false}
              />
              <Field
                label="Timezone"
                name="timezone"
                defaultValue="Asia/Kolkata"
              />
            </div>
          </StepPanel>
          <StepPanel
            index={3}
            step={step}
            title="Doctors and staff"
            description="Create the primary provider now; individual staff invitations stay in Clinic 360° for secure role assignment."
          >
            <Field
              label="Primary doctor/provider"
              name="providerName"
              required={false}
            />
          </StepPanel>
          <StepPanel
            index={4}
            step={step}
            title="Hours and availability"
            description="A safe default schedule is applied and explicitly surfaced in launch readiness."
          >
            <SecurityNote>
              The primary branch starts at 09:00–18:00 with 30-minute
              appointment slots. Review and adjust it in Clinic 360° before
              go-live.
            </SecurityNote>
          </StepPanel>
          <StepPanel
            index={5}
            step={step}
            title="Initial services"
            description="Select at least one bookable service. Pricing and practitioner assignment can be completed in Clinic 360°."
          >
            <ChoiceGrid name="serviceName" values={services} />
          </StepPanel>
          <StepPanel
            index={6}
            step={step}
            title="WhatsApp communication"
            description="Configure patient-facing copy without collecting Meta credentials."
          >
            <div className="grid gap-4">
              <Field
                label="English welcome message"
                name="welcomeEnglish"
                required={false}
              />
              <Field
                label="Hindi welcome message"
                name="welcomeHindi"
                required={false}
              />
              <SecurityNote>
                The secure Meta Embedded Signup connects the WABA after tenant
                creation. Tokens are never accepted here.
              </SecurityNote>
            </div>
          </StepPanel>
          <StepPanel
            index={7}
            step={step}
            title="Features and automations"
            description="Entitlements are validated against the platform feature registry during activation."
          >
            <ChoiceGrid name="featureKey" values={features} />
          </StepPanel>
          <StepPanel
            index={8}
            step={step}
            title="Subscription"
            description="Choose the initial commercial state; detailed billing exceptions remain governed separately."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">
                Subscription plan
                <select
                  name="planId"
                  className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3"
                >
                  <option value="">No plan / configure later</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold">
                Initial status
                <select
                  name="subscriptionStatus"
                  className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3"
                >
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>
            </div>
          </StepPanel>
          <StepPanel
            index={9}
            step={step}
            title="Domain and access"
            description="The workspace key is normalized and checked for uniqueness during activation."
          >
            <Field
              label="Workspace URL key"
              name="slug"
              pattern="[a-zA-Z0-9 -]+"
              placeholder="smile-dental-pune"
            />
          </StepPanel>
          <StepPanel
            index={10}
            step={step}
            title="Review, preflight, and activate"
            description="Review every section, run server preflight, then complete the explicit activation ceremony."
          >
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Review
                  label="Organization"
                  value={summary("name")}
                  onEdit={() => void editStep(0)}
                />
                <Review
                  label="Initial owner"
                  value={summary("ownerEmail")}
                  onEdit={() => void editStep(0)}
                />
                <Review
                  label="Brand"
                  value={summary("brandName")}
                  onEdit={() => void editStep(1)}
                />
                <Review
                  label="Location"
                  value={summary("locationName")}
                  onEdit={() => void editStep(2)}
                />
                <Review
                  label="Doctors & staff"
                  value={summary("providerName", "Invite after provisioning")}
                  onEdit={() => void editStep(3)}
                />
                <Review
                  label="Hours"
                  value="09:00–18:00 default schedule"
                  onEdit={() => void editStep(4)}
                />
                <Review
                  label="Services"
                  value={summary("serviceName")}
                  onEdit={() => void editStep(5)}
                />
                <Review
                  label="Features"
                  value={summary("featureKey")}
                  onEdit={() => void editStep(7)}
                />
                <Review
                  label="WhatsApp"
                  value={summary(
                    "welcomeEnglish",
                    "Connect after provisioning",
                  )}
                  onEdit={() => void editStep(6)}
                />
                <Review
                  label="Subscription"
                  value={summary("subscriptionStatus", "Trial")}
                  onEdit={() => void editStep(8)}
                />
                <Review
                  label="Workspace"
                  value={summary("slug")}
                  onEdit={() => void editStep(9)}
                />
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <h3 className="font-semibold text-[var(--heading)]">
                  Launch readiness
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                    Required organization, location, service, feature,
                    commercial, and workspace configuration is complete.
                  </li>
                  <li className="flex items-start gap-2 text-amber-800">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                    Provisioning creates an ONBOARDING tenant. Tenant login
                    remains blocked until a separate, audited go-live
                    transition.
                  </li>
                  <li className="flex items-start gap-2 text-amber-800">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                    Before go-live, review opening hours, invite the clinic
                    team, connect WhatsApp, approve templates, assign a backup
                    owner, train the team, and confirm the backup plan in Clinic
                    360°.
                  </li>
                </ul>
              </div>
              <div
                className={`rounded-xl border p-4 ${preflightState === "passed" ? "border-emerald-200 bg-emerald-50" : preflightState === "failed" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {preflightState === "passed" ? (
                        <CheckCircle2 className="size-5 text-emerald-700" />
                      ) : (
                        <ShieldCheck className="size-5 text-amber-700" />
                      )}
                      {preflightState === "passed"
                        ? "Server preflight passed"
                        : preflightState === "checking"
                          ? "Running server preflight…"
                          : preflightState === "failed"
                            ? "Preflight found issues"
                            : "Preflight not yet run"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The server verifies the owned draft snapshot, workspace
                      key, owner email, temporary-password policy, plan,
                      services, features, and tenant configuration. The password
                      is never written to the draft.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void runPreflight()}
                    disabled={
                      preflightState === "checking" || saving || !allComplete
                    }
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {preflightState === "passed"
                      ? "Re-run preflight"
                      : "Run preflight"}
                  </button>
                </div>
                {preflightIssues.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-rose-800">
                    {preflightIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
                <h3 className="font-semibold text-[var(--heading)]">
                  Provisioning activation
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  This creates the clinic, owner, location, hours, services,
                  entitlement, subscription, WhatsApp shell, launch checklist,
                  and audit event in ONBOARDING state. It does not enable tenant
                  access or mark the clinic live.
                </p>
                <label className="mt-4 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="activationAcknowledgement"
                    checked={activationConfirmed}
                    onChange={(event) =>
                      setActivationConfirmed(event.target.checked)
                    }
                    className="mt-0.5"
                  />
                  I reviewed the configuration and understand this provisions an
                  ONBOARDING tenant; go-live is a separate audited action.
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Type ACTIVATE
                  <input
                    name="activationConfirmation"
                    value={activateText}
                    onChange={(event) => setActivateText(event.target.value)}
                    autoComplete="off"
                    className="mt-1.5 h-11 w-full rounded-xl border bg-white px-3 font-normal"
                  />
                </label>
              </div>
            </div>
          </StepPanel>
          {stepError && (
            <p
              role="alert"
              className="mt-5 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800"
            >
              {stepError}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => void goPrevious()}
                  className="h-11 rounded-xl border px-5 font-semibold"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPreflightState("idle");
                  setPreflightIssues([]);
                  void persist(step);
                }}
                disabled={saving}
                className="inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
              >
                <Save className="size-4" />
                Retry save
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await persist(step))
                    window.location.assign("/platform/clinics/new");
                }}
                disabled={saving}
                className="h-11 rounded-xl border px-4 text-sm font-semibold"
              >
                Save and exit
              </button>
            </div>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => void goNext()}
                disabled={saving}
                className="h-11 rounded-xl bg-primary px-5 font-semibold text-white"
              >
                Validate & continue
              </button>
            ) : (
              <ActivationSubmitButton
                disabled={
                  !allComplete ||
                  preflightState !== "passed" ||
                  activateText !== "ACTIVATE" ||
                  !activationConfirmed ||
                  saving
                }
              />
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function StepPanel({
  index,
  step,
  title,
  description,
  children,
}: {
  index: number;
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section data-step={index} hidden={step !== index}>
      <p className="platform-eyebrow">{steps[index].group}</p>
      <h3
        tabIndex={-1}
        className="mt-1 text-xl font-bold text-[var(--heading)]"
      >
        {title}
      </h3>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
function Field({
  label,
  className = "",
  required = true,
  ...props
}: {
  label: string;
  className?: string;
  required?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`text-sm font-semibold ${className}`}>
      {label}
      <input
        required={required}
        {...props}
        className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 font-normal"
      />
    </label>
  );
}
function ChoiceGrid({ name, values }: { name: string; values: string[] }) {
  return (
    <fieldset>
      <legend className="sr-only">Select {name}</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {values.map((value) => (
          <label key={value} className="rounded-lg border p-3 text-sm">
            <input
              name={name}
              type="checkbox"
              value={value}
              defaultChecked
              className="mr-2"
            />
            {value.replaceAll("_", " ")}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function SecurityNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground md:col-span-2">
      <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
      {children}
    </p>
  );
}
function Review({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
        >
          <Edit3 className="size-3" />
          Edit
        </button>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--heading)]">
        {value}
      </p>
    </div>
  );
}
function PlatformSaveState({
  saving,
  failed,
}: {
  saving: boolean;
  failed: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${failed ? "text-rose-700" : "text-muted-foreground"}`}
    >
      {failed ? (
        <CloudOff className="size-4" />
      ) : saving ? (
        <Cloud className="size-4 animate-pulse" />
      ) : (
        <Check className="size-4 text-emerald-700" />
      )}
      {failed ? "Not saved" : saving ? "Saving" : "Draft safe"}
    </span>
  );
}

function ActivationSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      className="h-11 rounded-xl bg-emerald-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Provisioning securely…" : "Activate provisioning"}
    </button>
  );
}
