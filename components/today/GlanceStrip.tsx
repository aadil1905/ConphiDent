import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  IndianRupee,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

/**
 * Today at a glance — the four figures the day is run on, above everything
 * else on the page.
 *
 * Each tile is one number plus the three things that make a number mean
 * anything: which way it moved, what it moved against, and where it sits in
 * the shape of the last seven days. A figure on its own is the thing people
 * argue about; a figure with a line under it is a figure you can act on.
 *
 * Every series here is reconstructed from the same rows the rest of the page
 * reads — nothing is smoothed, seeded or carried forward. Where a day has no
 * history to reconstruct, the tile is not shown at all rather than drawn flat.
 */

export type GlanceTone = "primary" | "warning" | "danger";

export type GlanceTile = {
  key: string;
  /** Which figure this is. Kept short — it sits on one line beside the icon. */
  label: string;
  /** Already formatted: rupees carry their symbol, counts are plain. */
  value: string;
  href: string;
  icon: "money" | "chairs" | "calls" | "risk";
  tone: GlanceTone;
  /** "18%" or "2". Null when there is nothing honest to compare against. */
  delta: string | null;
  deltaUp: boolean;
  /** Up is not always good — a rising callback queue is a worse day. */
  deltaIsGood: boolean;
  /** The sentence under the number. Says what the delta is measured against. */
  compare: string;
  /** Seven values, oldest first, ending on today. */
  series: number[];
  /** What the bar measures. Never the word "target" unless one is recorded. */
  footLabel: string;
  /** 0–100 after clamping; the label carries the true figure when it is over. */
  footPct: number;
};

const ICONS: Record<GlanceTile["icon"], LucideIcon> = {
  money: IndianRupee,
  chairs: CalendarDays,
  calls: PhoneCall,
  risk: AlertTriangle,
};

/** Icon plate, sparkline and progress bar all take the tile's one accent. */
const TONE: Record<GlanceTone, { plate: string; ink: string; fill: string; bar: string; edge: string }> = {
  primary: {
    plate: "bg-[var(--primary-soft)]",
    ink: "text-primary",
    fill: "color-mix(in oklab, var(--primary) 9%, transparent)",
    bar: "bg-primary",
    edge: "border-l-primary",
  },
  warning: {
    plate: "bg-warning-bg",
    ink: "text-warning",
    fill: "color-mix(in oklab, var(--warning) 10%, transparent)",
    bar: "bg-warning",
    edge: "border-l-warning",
  },
  danger: {
    plate: "bg-danger-bg",
    ink: "text-danger-mark",
    fill: "color-mix(in oklab, var(--danger-mark) 9%, transparent)",
    bar: "bg-danger-mark",
    edge: "border-l-danger-mark",
  },
};

/**
 * Seven points across a 100×30 box. The line is normalised to its own range
 * rather than to zero — the question a sparkline answers is "which way is this
 * going", and a queue that ran 8·9·11·10·13·13·17 says nothing if it is drawn
 * against a floor of zero. The 26/22 numbers leave room for the end dot and
 * the stroke to sit inside the box without clipping.
 */
function sparkline(series: number[]) {
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const points = series.map((value, index) => {
    const x = (index / Math.max(1, series.length - 1)) * 100;
    const y = 26 - ((value - min) / span) * 22;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const last = points[points.length - 1];
  return { line, area: `0,30 ${line} 100,30`, lastX: last[0], lastY: last[1] };
}

function Tile({ tile }: { tile: GlanceTile }) {
  const Icon = ICONS[tile.icon];
  const tone = TONE[tile.tone];
  const { line, area, lastX, lastY } = sparkline(tile.series);
  const bar = Math.max(0, Math.min(100, tile.footPct));

  return (
    <Link
      href={tile.href}
      // The 3px tone stroke down the edge — the same mark the lists use for a
      // row that needs attention, and what keeps four white tiles on a grey
      // ground from reading as one flat sheet.
      className={`flex w-full flex-col rounded-card border border-border border-l-[3px] ${tone.edge} bg-card px-4 pt-[15px] pb-3.5 text-left shadow-[var(--shadow)] transition-colors duration-150 hover:bg-surface-hover`}
    >
      <span className="flex h-[22px] items-center gap-2">
        <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-chip ${tone.plate} ${tone.ink}`}>
          <Icon className="h-[13px] w-[13px]" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-secondary)] font-semibold text-text-muted">
          {tile.label}
        </span>
      </span>

      <span className="mt-[11px] flex h-8 items-end gap-2 overflow-hidden">
        <span className="text-[length:var(--text-tile)] leading-[var(--text-tile-lh)] font-bold whitespace-nowrap tabular-nums text-heading">
          {tile.value}
        </span>
        {tile.delta && (
          <span
            className={`inline-flex items-center gap-[3px] pb-0.5 text-xs font-bold whitespace-nowrap ${
              tile.deltaIsGood ? "text-success" : "text-danger"
            }`}
          >
            {/* The arrow says which way it moved; the colour says whether that
                is good news. They disagree on the callback queue, and that is
                the point — state is never carried by colour alone. */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {tile.deltaUp ? (
                <path d="M12 19V5M5 12l7-7 7 7" />
              ) : (
                <path d="M12 5v14M19 12l-7 7-7-7" />
              )}
            </svg>
            {tile.delta}
          </span>
        )}
      </span>

      <span className="mt-[3px] block h-[19px] truncate text-[length:var(--text-secondary)] text-text-muted">
        {tile.compare}
      </span>

      <svg
        viewBox="0 0 100 30"
        preserveAspectRatio="none"
        aria-hidden
        className="mt-2.5 block h-[34px] w-full overflow-visible"
      >
        <polyline points={area} fill={tone.fill} stroke="none" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={tone.ink}
        />
        <circle cx={lastX} cy={lastY} r={2.4} fill="currentColor" className={tone.ink} />
      </svg>

      <span className="mt-[11px] flex items-center justify-between gap-2 text-[length:var(--text-micro)] font-semibold whitespace-nowrap text-text-muted">
        <span className="min-w-0 truncate">{tile.footLabel}</span>
        <span className={`flex-none tabular-nums ${tone.ink}`}>{tile.footPct}%</span>
      </span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-pill bg-muted">
        <span className={`block h-full rounded-pill ${tone.bar}`} style={{ width: `${bar}%` }} />
      </span>
    </Link>
  );
}

export default function GlanceStrip({ tiles }: { tiles: GlanceTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section
      aria-label="Today at a glance"
      className="grid grid-cols-[repeat(auto-fit,minmax(178px,1fr))] gap-3"
    >
      {tiles.map((tile) => (
        <Tile key={tile.key} tile={tile} />
      ))}
    </section>
  );
}
