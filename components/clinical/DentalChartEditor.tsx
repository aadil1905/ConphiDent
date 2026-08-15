"use client";

import { FileImage } from "lucide-react";
import { memo, useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDentalChartEntriesAction } from "@/app/dashboard/clinical-workspace/actions";
import {
  DENTITION_STAGE_LABELS,
  formatAge,
  isFdiAllowedForStage,
  pronounceFdiCode,
  suggestDentitionStage,
  toothRowsForStage,
  type DentitionStage,
} from "@/lib/dentition";
import ImagingImportForm from "@/components/imaging/ImagingImportForm";

type Entry = {
  toothNumber: string;
  condition: string;
  notes: string | null;
  recordType?: string;
  surfaces?: string[];
};

const conditionLabels: Record<string, string> = {
  HEALTHY: "Healthy",
  CARIES: "Caries",
  FILLING: "Filling",
  CROWN: "Crown",
  ROOT_CANAL: "Root canal",
  MISSING: "Missing",
  IMPLANT: "Implant",
  WATCH: "Watch",
};

const surfaceOptions = [
  ["M", "Mesial"],
  ["D", "Distal"],
  ["B", "Buccal / facial"],
  ["L", "Lingual / palatal"],
  ["O", "Occlusal / incisal"],
] as const;

/** Anatomical tooth silhouettes, one per tooth family. */
const TOOTH_SHAPES = {
  incisor:
    "M13 7c0-2.2 2.4-3.4 7-3.4S27 4.8 27 7v11.5c0 3.6-1.8 5.6-3.4 6.9l-1.4 21.2c-.2 3-3.6 3-3.8 0L17 25.4C15.2 24 13 22 13 18.5z",
  canine:
    "M20 3.2c2.1 0 3.3 2.4 4.2 6.4l1.7 8.2c.8 3.9-1 6.4-2.6 7.7l-1.4 21.5c-.2 3-3.6 3-3.8 0L16.7 25.5C15 24.2 13.3 21.7 14.1 17.8l1.7-8.2C16.7 5.6 17.9 3.2 20 3.2z",
  premolar:
    "M11 13.5C11 8.9 15 5.6 20 5.6s9 3.3 9 7.9v6.2c0 3.1-1.6 5-3.2 6.1l-1.3 16.9c-.2 2.7-3.2 2.7-3.4 0L20.4 28h-.8l-.7 14.7c-.2 2.7-3.2 2.7-3.4 0L14.2 25.8C12.6 24.7 11 22.8 11 19.7z",
  molar:
    "M8 14.4C8 9 13.4 5.4 20 5.4s12 3.6 12 9v5.6c0 3-1.5 4.9-3.1 6l-1.2 15.4c-.2 2.7-3.1 2.7-3.3 0L23.2 27h-.9l-.6 14.4c-.2 2.7-3.1 2.7-3.3 0L17.7 27h-.9L16 41.4c-.2 2.7-3.1 2.7-3.3 0L11.5 26C9.9 24.9 8 23 8 20z",
} as const;

function toothFamily(code: string): keyof typeof TOOTH_SHAPES {
  const quadrant = Number(code[0]);
  const position = Number(code[code.length - 1]);
  if (position <= 2) return "incisor";
  if (position === 3) return "canine";
  if (quadrant >= 5) return "molar"; // primary dentition has no premolars
  if (position <= 5) return "premolar";
  return "molar";
}

const NEEDS_WORK = new Set(["CARIES", "WATCH"]);
const TREATED = new Set(["FILLING", "CROWN", "ROOT_CANAL", "IMPLANT"]);

const ToothGlyph = memo(function ToothGlyph({
  tooth,
  condition,
  selected,
  upper,
  onSelect,
}: {
  tooth: string;
  condition: string;
  selected: boolean;
  upper: boolean;
  onSelect: (tooth: string) => void;
}) {
  const family = toothFamily(tooth);
  const width = family === "molar" ? 32 : family === "premolar" ? 27 : 24;
  const missing = condition === "MISSING";
  const fill = selected
    ? "var(--secondary)"
    : NEEDS_WORK.has(condition)
      ? "var(--danger-mark)"
      : TREATED.has(condition)
        ? "var(--primary)"
        : "#ffffff";
  const stroke = selected
    ? "var(--primary)"
    : NEEDS_WORK.has(condition) || TREATED.has(condition)
      ? "#123b5d"
      : "rgba(23,107,135,0.45)";
  const stateWord = missing
    ? "missing"
    : NEEDS_WORK.has(condition)
      ? "needs work"
      : TREATED.has(condition)
        ? "treated"
        : condition === "HEALTHY"
          ? "healthy"
          : "nothing recorded";
  const number = (
    <span className="text-[10px] tabular-nums text-text-muted">{tooth}</span>
  );
  return (
    <button
      type="button"
      onClick={() => onSelect(tooth)}
      aria-pressed={selected}
      aria-label={`Tooth ${pronounceFdiCode(tooth)} · ${stateWord}`}
      title={`Tooth ${tooth} · ${stateWord}`}
      className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-[0.4rem] border px-px py-1 transition-colors hover:border-primary/50 ${
        selected ? "border-primary bg-secondary-hover" : "border-primary/20 bg-card"
      } ${missing ? "opacity-40" : ""}`}
    >
      {upper && (
        <svg width={width} height={42} viewBox="0 0 40 56" className="block rotate-180">
          <path d={TOOTH_SHAPES[family]} style={{ fill }} stroke={stroke} strokeWidth={1.6} />
        </svg>
      )}
      {number}
      {!upper && (
        <svg width={width} height={42} viewBox="0 0 40 56" className="block">
          <path d={TOOTH_SHAPES[family]} style={{ fill }} stroke={stroke} strokeWidth={1.6} />
        </svg>
      )}
    </button>
  );
});

function chip(on: boolean) {
  return `min-h-10 cursor-pointer rounded-pill border px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
    on ? "border-primary bg-secondary text-heading" : "border-border-strong bg-card text-heading hover:bg-muted"
  }`;
}

export default function DentalChartEditor({
  patientId,
  appointmentId,
  entries,
  visitDate,
  dateOfBirth,
  initialDentitionStage = "NOT_ASSESSED",
  isNewWorkspace = false,
  encounterId,
  imagingProviders = [],
  clinicTimezone = "Asia/Kolkata",
}: {
  patientId: number;
  appointmentId?: number | null;
  entries: Entry[];
  visitDate: string;
  dateOfBirth?: string | null;
  initialDentitionStage?: DentitionStage;
  isNewWorkspace?: boolean;
  encounterId?: number | null;
  imagingProviders?: { id: number; label: string }[];
  clinicTimezone?: string;
}) {
  const suggestedStage = suggestDentitionStage(dateOfBirth, `${visitDate}T12:00:00+05:30`);
  const [stage, setStage] = useState<DentitionStage>(
    initialDentitionStage === "NOT_ASSESSED" ? suggestedStage || "NOT_ASSESSED" : initialDentitionStage,
  );
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [optimisticEntries, setOptimisticEntries] = useState(entries);
  const [kind, setKind] = useState<"FINDING" | "COMPLETED_PROCEDURE">("FINDING");
  const [condition, setCondition] = useState("");
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [toothNote, setToothNote] = useState("");
  const [sessionLog, setSessionLog] = useState<
    { id: number; teeth: string; what: string; detail: string; toothNumbers: string[] }[]
  >([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const entryMap = useMemo(
    () => new Map(optimisticEntries.map((entry) => [entry.toothNumber, entry])),
    [optimisticEntries],
  );
  const rows = toothRowsForStage(stage);
  const documented = optimisticEntries.filter((entry) => entry.condition !== "HEALTHY").length;
  const needsReview = optimisticEntries.filter((entry) => NEEDS_WORK.has(entry.condition)).length;

  function changeStage(next: DentitionStage) {
    setSelectedTeeth((current) => current.filter((tooth) => isFdiAllowedForStage(tooth, next)));
    setStage(next);
    setResult(null);
  }

  const selectTooth = useCallback((tooth: string) => {
    setSelectedTeeth((current) =>
      current.includes(tooth) ? current.filter((item) => item !== tooth) : [...current, tooth],
    );
    setResult(null);
  }, []);

  const record = useCallback(() => {
    if (!condition) {
      toast.message("Pick what it is first — one tap on a chip.");
      return;
    }
    const teeth = [...selectedTeeth];
    const chosenKind = kind;
    const chosenCondition = condition;
    const chosenSurfaces = [...surfaces];
    const note = toothNote.trim();
    const formData = new FormData();
    formData.set("patientId", String(patientId));
    formData.set("appointmentId", appointmentId ? String(appointmentId) : "");
    formData.set("toothNumbers", teeth.join(","));
    formData.set("visitDate", visitDate);
    formData.set("dentitionStage", stage);
    formData.set("recordType", chosenKind);
    formData.set("condition", chosenCondition);
    formData.set("notes", note);
    chosenSurfaces.forEach((surface) => formData.append("surfaces", surface));
    formData.set("confirmed", "1");
    if (isNewWorkspace) formData.set("allowNewWorkspace", "1");
    startSaving(async () => {
      const response = await saveDentalChartEntriesAction(formData);
      setResult(response.ok ? null : response);
      if (!response.ok) {
        toast.error(response.message);
        return;
      }
      setOptimisticEntries((current) => {
        const next = new Map(current.map((entry) => [entry.toothNumber, entry]));
        teeth.forEach((toothNumber) =>
          next.set(toothNumber, {
            toothNumber,
            condition: chosenCondition,
            notes: note || null,
            recordType: chosenKind,
            surfaces: chosenSurfaces,
          }),
        );
        return Array.from(next.values());
      });
      setSessionLog((current) => [
        {
          id: Date.now(),
          teeth: teeth.join(", "),
          what: `${chosenKind === "FINDING" ? "Found" : "Did today"} · ${conditionLabels[chosenCondition] || chosenCondition}`,
          detail:
            (chosenSurfaces.length ? `Surfaces ${chosenSurfaces.join(", ")}` : "No surface noted") +
            (note ? ` · ${note}` : ""),
          toothNumbers: teeth,
        },
        ...current,
      ]);
      setSelectedTeeth([]);
      setCondition("");
      setSurfaces([]);
      setToothNote("");
      toast.success("Added to the chart.");
    });
  }, [appointmentId, condition, isNewWorkspace, kind, patientId, selectedTeeth, stage, surfaces, toothNote, visitDate]);

  const selectionLabel =
    selectedTeeth.length === 0
      ? "no tooth yet"
      : selectedTeeth.length === 1
        ? `tooth ${selectedTeeth[0]}`
        : `${selectedTeeth.length} teeth`;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)] sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-heading">The mouth</h2>
            <div className="flex flex-wrap gap-1.5">
              {(["PRIMARY", "MIXED", "PERMANENT"] as DentitionStage[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={stage === item}
                  onClick={() => changeStage(item)}
                  className={chip(stage === item)}
                >
                  {DENTITION_STAGE_LABELS[item]}
                  {suggestedStage === item && stage !== item && (
                    <span className="ml-1 font-normal text-text-muted">· suggested</span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 mb-3.5 text-[13px] text-text-muted">
            {selectedTeeth.length > 0
              ? `Selected ${selectedTeeth.join(", ")} — record them together on the right.`
              : `Age at visit: ${formatAge(dateOfBirth, `${visitDate}T12:00:00+05:30`)}. Tap a tooth — FDI 36 is said as "three six". Pick several to record them together.`}
          </p>

          {rows.length === 0 ? (
            <div className="rounded-control border border-warning-border bg-warning-bg p-5 text-center text-sm text-heading">
              Confirm the dentition above to show the right chart — eruption and retained teeth can
              differ from age, so a clinician decides.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 overflow-x-auto pb-1">
              {rows.map((row, index) => {
                const upper = row.id.includes("upper");
                return (
                  <div key={row.id} className="contents">
                    {index > 0 && !upper && rows[index - 1].id.includes("upper") && (
                      <div className="h-px w-full max-w-[600px] bg-primary/20" />
                    )}
                    <div className="mx-auto flex w-max flex-nowrap gap-0.5">
                      {row.teeth.map((tooth) => (
                        <ToothGlyph
                          key={tooth}
                          tooth={tooth}
                          condition={entryMap.get(tooth)?.condition || ""}
                          selected={selectedTeeth.includes(tooth)}
                          upper={upper}
                          onSelect={selectTooth}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-4 text-xs text-text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-danger-mark" />
                  Needs work
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-primary" />
                  Treated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[2px] border border-primary bg-secondary" />
                  Selected
                </span>
                <span>
                  {documented} documented · {needsReview} to review
                </span>
                {selectedTeeth.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTeeth([])}
                    className="cursor-pointer font-semibold text-primary hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-card border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-4 pb-3">
            <h2 className="text-base font-semibold text-heading">Recorded this visit</h2>
            <span className="text-xs text-text-muted">
              {sessionLog.length === 0
                ? "Nothing yet"
                : `${sessionLog.length} ${sessionLog.length === 1 ? "entry" : "entries"} on ${visitDate}`}
            </span>
          </div>
          {sessionLog.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4.5 pt-4 pb-7 text-center">
              <p className="text-sm font-semibold text-heading">Nothing recorded yet</p>
              <p className="text-[13px] text-text-muted">
                Pick a tooth above, choose what you found or did, and it lands here.
              </p>
            </div>
          ) : (
            sessionLog.map((entry) => (
              <div
                key={entry.id}
                className="grid items-center gap-3 border-t border-border/80 px-4.5 py-2.5 sm:grid-cols-[90px_minmax(0,1fr)_auto]"
              >
                <span className="text-[13px] font-semibold tabular-nums text-heading">{entry.teeth}</span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{entry.what}</p>
                  <p className="text-[13px] text-text-muted">{entry.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTeeth(entry.toothNumbers)}
                  className="min-h-10 cursor-pointer rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted"
                >
                  Amend
                </button>
              </div>
            ))
          )}
          {sessionLog.length > 0 && (
            <p className="border-t border-border/80 px-4.5 py-2.5 text-xs text-text-muted">
              Chart entries are signed — to change one, select its teeth again and record the
              correction. Both versions stay on the record.
            </p>
          )}
        </section>

        <details className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
          <summary
            className={`flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-heading ${selectedTeeth.length === 0 ? "pointer-events-none opacity-50" : ""}`}
          >
            <FileImage className="size-4.5 text-primary" />
            Upload an X-ray for {selectionLabel}
          </summary>
          {selectedTeeth.length > 0 ? (
            <div className="mt-3.5 border-t border-border pt-3.5">
              <p className="mb-3.5 text-[13px] text-text-muted">
                The patient, visit and teeth are linked automatically. The image also appears in
                Patient 360 and Imaging.
              </p>
              <ImagingImportForm
                providers={imagingProviders}
                clinicTimezone={clinicTimezone}
                clinicalContext={{ patientId, encounterId, toothCodes: selectedTeeth }}
              />
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-text-muted">Select one or more teeth on the chart first.</p>
          )}
        </details>
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-20">
        <div className="flex flex-col gap-3 rounded-card border border-primary/25 bg-card p-4 shadow-[var(--shadow)]">
          <h2 className="text-[15px] font-semibold text-heading">Record on {selectionLabel}</h2>

          {selectedTeeth.length === 0 ? (
            <p className="text-[13px] text-text-muted">
              Pick one or more teeth on the chart. You can pick several and record them together.
            </p>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-heading">What is it?</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["FINDING", "Found"],
                      ["COMPLETED_PROCEDURE", "Did today"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                      className={chip(kind === value).replace("rounded-pill", "rounded-control")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-heading">What you found or did</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(conditionLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={condition === value}
                      onClick={() => setCondition(value)}
                      className={chip(condition === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset className="m-0 rounded-control border border-border px-3 py-2.5">
                <legend className="px-1.5 text-xs font-semibold text-heading">Surfaces</legend>
                <div className="flex flex-wrap gap-1.5">
                  {surfaceOptions.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={surfaces.includes(value)}
                      title={label}
                      onClick={() =>
                        setSurfaces((current) =>
                          current.includes(value)
                            ? current.filter((item) => item !== value)
                            : [...current, value],
                        )
                      }
                      className={`min-h-10 min-w-11 cursor-pointer rounded-chip border px-2.5 text-[13px] font-semibold ${
                        surfaces.includes(value)
                          ? "border-primary bg-secondary text-heading"
                          : "border-border-strong bg-card text-heading hover:bg-muted"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-heading">Note on this tooth</span>
                <input
                  value={toothNote}
                  onChange={(event) => setToothNote(event.target.value)}
                  placeholder="Optional — material, advice, detail"
                  className="min-h-11 rounded-control border border-border bg-card px-3 text-sm text-foreground"
                />
              </label>

              {result && !result.ok && (
                <p role="status" className="rounded-chip border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
                  {result.message}
                </p>
              )}

              <button
                type="button"
                onClick={record}
                disabled={isSaving || stage === "NOT_ASSESSED"}
                className="min-h-12 cursor-pointer rounded-control border border-primary bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Adding…" : "Add to the chart"}
              </button>
              <p className="text-xs text-text-muted">
                Saves straight away as a signed entry for {visitDate} — no pop-ups.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
