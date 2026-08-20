import {
  DENTITION_STAGE_LABELS,
  dentitionForFdiCode,
  pronounceFdiCode,
  toothRowsForStage,
  type DentitionStage,
} from "@/lib/dentition";

type Entry = { toothNumber: string; condition: string; notes: string | null };

const conditionLabels: Record<string, string> = {
  HEALTHY: "Healthy", CARIES: "Caries", FILLING: "Filling", CROWN: "Crown",
  ROOT_CANAL: "Root canal", MISSING: "Missing", IMPLANT: "Implant", WATCH: "Watch",
};

const NEEDS_WORK = new Set(["CARIES", "WATCH"]);
const TREATED = new Set(["FILLING", "CROWN", "ROOT_CANAL", "IMPLANT"]);

/** Same three states as the chart you write on: needs work, treated, nothing. */
function toothClass(condition: string) {
  if (condition === "MISSING") return "border-border bg-muted text-text-muted line-through";
  if (NEEDS_WORK.has(condition)) return "border-danger-border bg-danger-bg text-danger";
  if (TREATED.has(condition)) return "border-primary bg-secondary text-heading";
  return "border-border bg-card text-heading";
}

function inferredStage(entries: Entry[]): DentitionStage {
  const types = new Set(entries.map((entry) => dentitionForFdiCode(entry.toothNumber)).filter(Boolean));
  if (types.size > 1) return "MIXED";
  if (types.has("PRIMARY")) return "PRIMARY";
  if (types.has("PERMANENT")) return "PERMANENT";
  return "NOT_ASSESSED";
}

export default function DentalChartSummary({ entries, dentitionStage }: { entries: Entry[]; dentitionStage?: DentitionStage }) {
  const entryMap = new Map(entries.map((entry) => [entry.toothNumber, entry]));
  const stage = dentitionStage || inferredStage(entries);
  const rows = toothRowsForStage(stage);
  const marked = entries.filter((entry) => entry.condition !== "HEALTHY");

  if (stage === "NOT_ASSESSED") {
    return (
      <div className="rounded-control border border-dashed border-warning-border bg-warning-bg px-4 py-3.5 text-[13px] text-heading">
        Nobody has said which teeth this patient has yet. Open the chart and pick adult, child or mixed
        first.
      </div>
    );
  }

  return (
    <div className="rounded-control border border-border bg-muted p-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span className="rounded-pill bg-card px-2.5 py-0.5 font-semibold text-heading">
          {DENTITION_STAGE_LABELS[stage]}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-danger-mark" />Needs work
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-primary" />Treated
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.id}>
            <p className="mb-1.5 text-xs font-semibold text-text-muted">{row.title}</p>
            <div className={`grid gap-1.5 ${row.teeth.length <= 10 ? "grid-cols-5 sm:grid-cols-10" : "grid-cols-4 sm:grid-cols-8 xl:grid-cols-16"}`}>
              {row.teeth.map((tooth) => {
                const condition = entryMap.get(tooth)?.condition || "HEALTHY";
                return (
                  <div
                    key={tooth}
                    title={`Tooth ${tooth} · ${conditionLabels[condition] || condition}`}
                    aria-label={`Tooth ${pronounceFdiCode(tooth)}: ${conditionLabels[condition] || condition}`}
                    className={`inline-flex min-h-12 min-w-0 flex-col items-center justify-center rounded-chip border px-1 py-1.5 text-center ${toothClass(condition)}`}
                  >
                    <span className="text-[13px] leading-none font-semibold tabular-nums">{tooth}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {marked.length > 0 && (
        <p className="mt-3.5 text-xs text-text-muted">
          Recorded:{" "}
          {marked
            .map((entry) => `${entry.toothNumber} — ${(conditionLabels[entry.condition] || entry.condition).toLowerCase()}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
