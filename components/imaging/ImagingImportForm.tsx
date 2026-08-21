"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { IMAGING_MODALITIES, IMAGING_MODALITY_LABELS } from "@/lib/imaging";
import PatientSearchSelect, { type PatientSearchOption } from "@/components/imaging/PatientSearchSelect";

type Option = { id: number; label: string };

const field = "min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground outline-none";
const labelClass = "flex flex-col gap-1.5 text-xs font-semibold text-heading";

function localValue(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

function zonedLocalToIso(value: string, timeZone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let guess = desired;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const represented = localValue(new Date(guess), timeZone);
      const shown = represented.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)!;
      const representedUtc = Date.UTC(Number(shown[1]), Number(shown[2]) - 1, Number(shown[3]), Number(shown[4]), Number(shown[5]));
      guess += desired - representedUtc;
    }
    const result = new Date(guess);
    return localValue(result, timeZone) === value ? result.toISOString() : null;
  } catch {
    return null;
  }
}

function Step({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border pb-2 sm:col-span-2">
      <span className="grid h-6 w-6 flex-none place-items-center rounded-pill bg-primary text-[length:var(--text-micro)] font-bold text-primary-foreground">
        {number}
      </span>
      <h3 className="text-[length:var(--text-secondary)] font-semibold text-heading">{title}</h3>
    </div>
  );
}

export default function ImagingImportForm({
  initialPatient = null,
  providers,
  clinicTimezone,
  clinicalContext,
  patientContext,
  stepped = false,
}: {
  initialPatient?: PatientSearchOption | null;
  providers: Option[];
  clinicTimezone: string;
  clinicalContext?: { patientId: number; encounterId?: number | null; toothCodes: string[] };
  patientContext?: { patientId: number };
  /** Numbered sections on its own page, rather than one block inside charting. */
  stepped?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const [state, setState] = useState<{ kind: "idle" | "uploading" | "success" | "error"; message: string; progress: number; studyId?: string }>({ kind: "idle", message: "", progress: 0 });
  const localNow = useMemo(() => {
    try {
      return localValue(new Date(), clinicTimezone);
    } catch {
      return "";
    }
  }, [clinicTimezone]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const acquisitionDate = zonedLocalToIso(String(data.get("acquisitionLocal") || ""), clinicTimezone);
    if (!acquisitionDate) {
      setState({ kind: "error", message: "That date and time did not read right — check it and try again.", progress: 0 });
      return;
    }
    data.delete("acquisitionLocal");
    data.set("acquisitionDate", acquisitionDate);
    const request = new XMLHttpRequest();
    setState({ kind: "uploading", message: "Checking the file and keeping the original…", progress: 0 });
    request.open("POST", "/api/imaging/import");
    request.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) setState((current) => ({ ...current, progress: Math.round((progressEvent.loaded / progressEvent.total) * 100) }));
    };
    request.onerror = () => setState({ kind: "error", message: "The upload stopped part-way. Nothing was saved — try again.", progress: 0 });
    request.onload = () => {
      let payload: { error?: string; studyId?: string; duplicateStudyId?: string } = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300 && payload.studyId) {
        setState({ kind: "success", message: "In. The original is kept exactly as it came.", progress: 100, studyId: payload.studyId });
        form.reset();
        setResetVersion((value) => value + 1);
        router.refresh();
      } else {
        setState({ kind: "error", message: payload.error || "That file could not be brought in.", progress: 0, studyId: payload.studyId || payload.duplicateStudyId });
      }
    };
    request.send(data);
  }

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-4" aria-busy={state.kind === "uploading"}>
      {clinicalContext ? (
        <>
          <input type="hidden" name="patientId" value={clinicalContext.patientId} />
          <input type="hidden" name="encounterId" value={clinicalContext.encounterId || ""} />
          <input type="hidden" name="toothCodes" value={clinicalContext.toothCodes.join(",")} />
          <input type="hidden" name="identityConfirmed" value="1" />
          <input type="hidden" name="matchReason" value="Patient and teeth confirmed in the signed clinical workspace." />
        </>
      ) : patientContext ? (
        <>
          <input type="hidden" name="patientId" value={patientContext.patientId} />
          <input type="hidden" name="identityConfirmed" value="1" />
          <input type="hidden" name="matchReason" value="Patient identity confirmed from the authenticated patient profile." />
        </>
      ) : null}

      <div className={stepped ? "flex flex-col gap-4" : "grid gap-3.5 sm:grid-cols-2"}>
        {stepped && <Step number={1} title="Whose X-ray is it?" />}
        <label className={`${labelClass} sm:col-span-2`}>The file
          <input
            name="file"
            type="file"
            accept=".dcm,application/dicom,image/jpeg,image/png,image/tiff"
            required
            className="min-h-11 w-full rounded-control border border-border bg-card p-2 text-sm font-normal text-foreground file:mr-3 file:rounded-chip file:border-0 file:bg-primary file:px-3 file:py-2 file:font-semibold file:text-primary-foreground"
          />
          <span className="text-xs font-normal text-text-muted">DICOM, JPEG, PNG or TIFF, up to 50 MB. The patient&rsquo;s name is never part of the stored filename.</span>
        </label>

        {!clinicalContext && !patientContext ? (
          <label className={labelClass}>Whose is it
            <PatientSearchSelect key={resetVersion} name="patientId" initialSelected={initialPatient} />
            <span className="text-xs font-normal text-text-muted">Leave it empty and it waits in the no-name queue.</span>
          </label>
        ) : (
          <div className="rounded-control border border-success-border bg-success-bg px-3 py-2.5 text-[length:var(--text-secondary)] text-success">
            <strong className="font-semibold">Patient linked</strong>
            <span className="mt-0.5 block text-xs">
              {clinicalContext
                ? `The patient, the visit and teeth ${clinicalContext.toothCodes.join(", ")} attach automatically.`
                : "It attaches to this patient."}
            </span>
          </div>
        )}

        {stepped && <Step number={2} title="What does it show?" />}

        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-semibold text-heading">When in the treatment</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {[
              ["PRE_TREATMENT", "Before", "Taken before you started"],
              ["POST_TREATMENT", "After", "Taken after the work"],
              ["OTHER", "Something else", "Check-up or reference"],
            ].map(([value, label, hint]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-control border border-border bg-card p-3 text-[length:var(--text-secondary)]">
                <input type="radio" name="treatmentStage" value={value} defaultChecked={value === "PRE_TREATMENT"} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>
                  <strong className="block font-semibold text-heading">{label}</strong>
                  <span className="text-xs text-text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className={labelClass}>What kind of X-ray
          <select name="modality" required defaultValue="INTRAORAL_PERIAPICAL" className={field}>
            {IMAGING_MODALITIES.map((item) => <option key={item} value={item}>{IMAGING_MODALITY_LABELS[item]}</option>)}
          </select>
        </label>
        {stepped && <Step number={3} title="The image itself" />}

        <label className={labelClass}>
          Taken at <span className="font-normal text-text-muted">({clinicTimezone})</span>
          <input name="acquisitionLocal" type="datetime-local" required defaultValue={localNow} className={field} />
        </label>
        <label className={labelClass}>Which dentist asked for it
          <select name="orderingProviderId" defaultValue="" className={field}>
            <option value="">Not recorded</option>
            {providers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={labelClass}>Region
          <input name="anatomicalRegion" placeholder="e.g. upper front" maxLength={160} className={field} />
        </label>
        <label className={labelClass}>Accession number
          <input name="accessionNumber" maxLength={128} className={field} />
        </label>
        <label className={labelClass}>Their ID on the machine
          <input name="externalPatientId" maxLength={128} className={field} />
        </label>

        {!clinicalContext && !patientContext ? (
          <>
            <label className={`${labelClass} sm:col-span-2`}>How you know it is them
              <input name="matchReason" minLength={8} maxLength={500} placeholder="e.g. clinic ID and date of birth both checked" className={field} />
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground sm:col-span-2">
              <input type="checkbox" name="identityConfirmed" value="1" className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>If I picked a patient, I checked something other than the name — an ID, the accession, or the date of birth.</span>
            </label>
          </>
        ) : null}

        <label className={`${labelClass} sm:col-span-2`}>Why it was taken
          <textarea name="clinicalIndication" rows={2} maxLength={1000} className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>Anything to note
          <textarea name="description" rows={2} maxLength={500} className="rounded-control border border-border bg-card p-3 text-sm font-normal text-foreground outline-none" />
        </label>
      </div>

      {state.kind !== "idle" ? (
        <div
          role="status"
          className={`rounded-control border px-3 py-2.5 text-[length:var(--text-secondary)] ${
            state.kind === "error"
              ? "border-danger-border bg-danger-bg text-danger"
              : state.kind === "success"
                ? "border-success-border bg-success-bg text-success"
                : "border-border bg-muted text-heading"
          }`}
        >
          <div className="flex items-center gap-2">
            {state.kind === "uploading" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
            <span>{state.message}</span>
          </div>
          {state.kind === "uploading" ? (
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, state.progress)}%` }} />
            </div>
          ) : null}
          {state.studyId ? (
            <a href={`/dashboard/imaging?study=${encodeURIComponent(state.studyId)}`} className="mt-2 inline-block font-semibold underline">
              Open the one already here
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={state.kind === "uploading"}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
        >
          {state.kind === "uploading" ? `Bringing it in — ${state.progress}%` : "Bring it in"}
        </button>
        <button
          type="button"
          disabled={state.kind === "uploading"}
          onClick={() => {
            formRef.current?.reset();
            setResetVersion((value) => value + 1);
            setState({ kind: "idle", message: "", progress: 0 });
          }}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted disabled:opacity-60"
        >
          Start over
        </button>
      </div>
    </form>
  );
}
