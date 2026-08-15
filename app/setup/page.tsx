export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";

/**
 * The setup portal: one screen for taking a clinic from a first conversation to
 * a workspace they can run the practice on. The stages already existed on
 * PlatformOnboarding but were only reachable as raw enum values inside a
 * collapsed list, so nothing showed how far along anybody actually was.
 */
const PHASES = [
  { name: "Selling", stages: ["LEAD", "QUALIFIED", "DEMO", "AGREEMENT"] },
  { name: "Setting up", stages: ["TENANT_CREATED", "BUSINESS_DETAILS", "BRANDING", "DOCTORS", "SERVICES", "WHATSAPP_SETUP"] },
  { name: "Checking", stages: ["VERIFICATION", "TESTING", "TRAINING"] },
  { name: "Live", stages: ["READY", "LIVE"] },
] as const;

const ALL_STAGES: string[] = PHASES.flatMap((phase) => [...phase.stages]);

/** The enum is for the database; this is what it is called out loud. */
const STAGE_WORDS: Record<string, string> = {
  LEAD: "First contact",
  QUALIFIED: "Worth pursuing",
  DEMO: "Demo given",
  AGREEMENT: "Agreed to buy",
  TENANT_CREATED: "Workspace created",
  BUSINESS_DETAILS: "Clinic details in",
  BRANDING: "Logo and colours",
  DOCTORS: "Dentists added",
  SERVICES: "Treatments and prices",
  WHATSAPP_SETUP: "WhatsApp connected",
  VERIFICATION: "Meta verification",
  TESTING: "Test run",
  TRAINING: "Staff trained",
  READY: "Ready to switch on",
  LIVE: "Live",
};

function phaseOf(stage: string) {
  return PHASES.find((phase) => (phase.stages as readonly string[]).includes(stage))?.name ?? "Selling";
}

export default async function SetupPortalPage() {
  await requirePlatformPermission("onboarding.manage");

  const [clinics, records, newLeads] = await Promise.all([
    prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, brandName: true, status: true, createdAt: true },
    }),
    prisma.platformOnboarding.findMany({
      select: { clinicId: true, stage: true, targetGoLiveAt: true, blockers: true },
    }),
    prisma.demoRequest.count(),
  ]);

  const byClinic = new Map(records.map((record) => [record.clinicId, record]));
  const rows = clinics.map((clinic) => {
    const record = byClinic.get(clinic.id);
    const stage = record?.stage && ALL_STAGES.includes(record.stage) ? record.stage : "TENANT_CREATED";
    const done = ALL_STAGES.indexOf(stage) + 1;
    return {
      ...clinic,
      stage,
      phase: phaseOf(stage),
      done,
      percent: Math.round((done / ALL_STAGES.length) * 100),
      target: record?.targetGoLiveAt ?? null,
      blocker: record?.blockers?.trim() || null,
    };
  });

  const counts = PHASES.map((phase) => ({
    name: phase.name,
    count: rows.filter((row) => row.phase === phase.name).length,
  }));
  const blocked = rows.filter((row) => row.blocker);

  return (
    <main className="mx-auto flex w-full max-w-[85rem] flex-col gap-5 px-[clamp(1rem,1.5vw,2rem)] py-[clamp(1rem,1.5vw,2rem)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold text-heading">Setup portal</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Every clinic from the first conversation to the day they go live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/platform/sales"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Demo requests{newLeads > 0 ? ` · ${newLeads}` : ""}
          </Link>
          <Link
            href="/platform/clinics/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Set up a new clinic
          </Link>
        </div>
      </header>

      <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]">
        {counts.map((phase) => (
          <div key={phase.name} className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">{phase.name}</p>
            <p className="text-2xl font-bold tabular-nums text-heading">{phase.count}</p>
            <p className="text-xs text-text-muted">
              {phase.count === 1 ? "clinic" : "clinics"}
            </p>
          </div>
        ))}
      </section>

      {blocked.length > 0 && (
        <section className="rounded-card border border-danger-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
          <h2 className="text-base font-semibold text-danger">
            {blocked.length} {blocked.length === 1 ? "clinic is" : "clinics are"} stuck
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {blocked.map((row) => (
              <li key={row.id} className="text-[13px] text-foreground">
                <span className="font-semibold text-heading">{row.brandName || row.name}</span> — {row.blocker}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-3.5 pb-2.5">
          <h2 className="text-base font-semibold text-heading">Where everyone is</h2>
          <Link href="/platform/onboarding" className="text-xs font-semibold text-primary hover:underline">
            Edit stages and notes
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="px-4.5 pb-5 text-[13px] text-text-muted">
            No clinics yet. Set one up and it appears here with its progress.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-x-5 gap-y-2.5 border-t border-border/70 px-4.5 py-3.5 md:grid-cols-[minmax(0,1fr)_16rem_9rem]"
            >
              <div className="min-w-0">
                <Link
                  href={`/platform/clinics/${row.id}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {row.brandName || row.name}
                </Link>
                <p className="text-xs text-text-muted">
                  {row.phase} · started {row.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>

              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-heading">{STAGE_WORDS[row.stage]}</span>
                  <span className="text-xs tabular-nums text-text-muted">
                    {row.done} of {ALL_STAGES.length}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-muted">
                  <div
                    className={`h-full rounded-pill ${row.stage === "LIVE" ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </div>

              <div className="text-xs text-text-muted md:text-right">
                {row.stage === "LIVE"
                  ? "Live"
                  : row.target
                    ? `Live by ${row.target.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                    : "No date set"}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
