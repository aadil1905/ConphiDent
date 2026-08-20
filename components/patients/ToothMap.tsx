const SHAPES = {
  incisor:
    "M13 7c0-2.2 2.4-3.4 7-3.4S27 4.8 27 7v11.5c0 3.6-1.8 5.6-3.4 6.9l-1.4 21.2c-.2 3-3.6 3-3.8 0L17 25.4C15.2 24 13 22 13 18.5z",
  canine:
    "M20 3.2c2.1 0 3.3 2.4 4.2 6.4l1.7 8.2c.8 3.9-1 6.4-2.6 7.7l-1.4 21.5c-.2 3-3.6 3-3.8 0L16.7 25.5C15 24.2 13.3 21.7 14.1 17.8l1.7-8.2C16.7 5.6 17.9 3.2 20 3.2z",
  premolar:
    "M11 13.5C11 8.9 15 5.6 20 5.6s9 3.3 9 7.9v6.2c0 3.1-1.6 5-3.2 6.1l-1.3 16.9c-.2 2.7-3.2 2.7-3.4 0L20.4 28h-.8l-.7 14.7c-.2 2.7-3.2 2.7-3.4 0L14.2 25.8C12.6 24.7 11 22.8 11 19.7z",
  molar:
    "M8 14.4C8 9 13.4 5.4 20 5.4s12 3.6 12 9v5.6c0 3-1.5 4.9-3.1 6l-1.2 15.4c-.2 2.7-3.1 2.7-3.3 0L23.2 27h-.9l-.6 14.4c-.2 2.7-3.1 2.7-3.3 0L17.7 27h-.9L16 41.4c-.2 2.7-3.1 2.7-3.3 0L11.5 26C9.9 24.9 8 23 8 20z",
};

const UPPER = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

/** Anything not obviously finished still needs someone to look at it. */
const TREATED = ["RESTORED", "CROWN", "ROOT_CANAL", "IMPLANT", "BRIDGE", "FILLED", "TREATED"];
const HEALTHY = ["HEALTHY", "SOUND", "", undefined];

function shapeFor(number: string) {
  const last = Number(number.slice(-1));
  if (last <= 2) return SHAPES.incisor;
  if (last === 3) return SHAPES.canine;
  if (last <= 5) return SHAPES.premolar;
  return SHAPES.molar;
}

type State = "work" | "treated" | "healthy";

function stateFor(condition: string | undefined): State {
  if (!condition || HEALTHY.includes(condition.toUpperCase())) return "healthy";
  if (TREATED.includes(condition.toUpperCase())) return "treated";
  return "work";
}

function Tooth({
  number,
  condition,
  flipped,
}: {
  number: string;
  condition: string | undefined;
  flipped: boolean;
}) {
  const state = stateFor(condition);
  // Matches DentalChartEditor's palette exactly — this is the same chart read
  // back, and a heritage hex left over from before the token migration had
  // drifted both its colours (danger-mark and chart-2 have since moved) and
  // its dark-mode behaviour (a literal white tooth was the brightest thing on
  // a black ground, the same bug the editor's own comment explains).
  const fill = state === "work" ? "var(--danger-mark)" : state === "treated" ? "var(--primary)" : "var(--card)";
  const label =
    state === "work"
      ? `needs work${condition ? ` — ${condition.toLowerCase().replace(/_/g, " ")}` : ""}`
      : state === "treated"
        ? "treated"
        : "nothing recorded";

  const glyph = (
    <svg
      width="26"
      height="34"
      viewBox="0 0 40 56"
      aria-hidden
      className={flipped ? "block rotate-180" : "block"}
    >
      <path
        d={shapeFor(number)}
        fill={fill}
        stroke={state === "healthy" ? "var(--border-strong)" : "var(--heading)"}
        strokeWidth="1.6"
      />
    </svg>
  );

  return (
    <span
      title={`Tooth ${number} · ${label}`}
      className={`flex flex-col items-center gap-0.5 rounded-[0.4rem] border px-0.5 py-1 ${
        state === "work"
          ? "border-danger-mark/40 bg-background"
          : state === "treated"
            ? "border-border bg-background"
            : "border-border bg-card"
      }`}
    >
      {flipped ? glyph : <span className="text-[10px] tabular-nums text-text-muted">{number}</span>}
      {flipped ? <span className="text-[10px] tabular-nums text-text-muted">{number}</span> : glyph}
    </span>
  );
}

/**
 * The mouth as it stands. Read-only here — charting itself happens in the
 * clinical workspace, and this only ever shows what was recorded there.
 */
export default function ToothMap({ conditions }: { conditions: Record<string, string> }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-[3px]">
        {UPPER.map((number) => (
          <Tooth key={number} number={number} condition={conditions[number]} flipped />
        ))}
      </div>
      <div className="h-px w-full max-w-[560px] bg-border-strong" />
      <div className="flex flex-wrap justify-center gap-[3px]">
        {LOWER.map((number) => (
          <Tooth key={number} number={number} condition={conditions[number]} flipped={false} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-danger-mark" aria-hidden />
          Needs work
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-primary" aria-hidden />
          Treated
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] border border-border-strong bg-card" aria-hidden />
          Healthy
        </span>
      </div>
    </div>
  );
}
