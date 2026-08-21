import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Every destination beside Today, one click away. The drawer already lists
 * these, but a drawer is closed by default — this is the same map open on the
 * page, with the one live fact per module that says whether it is worth a
 * click right now.
 */

export type ModuleTone = "calm" | "warn" | "bad";

export type ModuleTile = {
  key: string;
  label: string;
  sub: string;
  href: string;
  icon: LucideIcon;
  tone: ModuleTone;
  /** Empty string renders no badge at all — a module with nothing due does
   *  not get a zero sitting on it. */
  badge: string;
};

const TONE: Record<ModuleTone, { plate: string; ink: string; sub: string; badgeBg: string; badgeInk: string }> = {
  calm: {
    plate: "bg-muted",
    ink: "text-primary",
    sub: "text-text-muted",
    badgeBg: "bg-muted",
    badgeInk: "text-text-muted",
  },
  warn: {
    plate: "bg-warning-bg",
    ink: "text-warning",
    sub: "text-text-muted",
    badgeBg: "bg-warning-bg",
    badgeInk: "text-warning",
  },
  bad: {
    plate: "bg-danger-bg",
    ink: "text-danger-mark",
    sub: "text-danger",
    badgeBg: "bg-danger-bg",
    badgeInk: "text-danger",
  },
};

export default function ModuleGrid({ modules }: { modules: ModuleTile[] }) {
  if (modules.length === 0) return null;

  return (
    <section
      aria-label="Jump to a module"
      className="rounded-card border border-border bg-card shadow-[var(--shadow)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-1">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
          Everything in the clinic
        </h2>
        <span className="text-xs whitespace-nowrap text-text-muted">Press ⌘K to jump anywhere</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(212px,1fr))] gap-2.5 px-5.5 pt-3.5 pb-5">
        {modules.map((module) => {
          const tone = TONE[module.tone];
          const Icon = module.icon;
          return (
            <Link
              key={module.key}
              href={module.href}
              className="flex min-h-16 w-full items-center gap-3 rounded-control border border-border bg-card px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-hover"
            >
              <span className={`grid h-[34px] w-[34px] flex-none place-items-center rounded-chip ${tone.plate} ${tone.ink}`}>
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-heading">{module.label}</span>
                <span className={`block truncate text-[length:var(--text-secondary)] ${tone.sub}`}>{module.sub}</span>
              </span>
              {module.badge && (
                <span
                  className={`inline-flex min-w-[22px] flex-none items-center justify-center rounded-pill px-1.5 py-0.5 text-[length:var(--text-micro)] font-bold tabular-nums ${tone.badgeBg} ${tone.badgeInk}`}
                >
                  {module.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
