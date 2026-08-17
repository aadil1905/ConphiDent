export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { brandFontVariables } from "@/lib/fonts";
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

  const [clinics, records, newLeads, signups] = await Promise.all([
    prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, brandName: true, status: true, createdAt: true },
    }),
    prisma.platformOnboarding.findMany({
      select: { clinicId: true, stage: true, targetGoLiveAt: true, blockers: true },
    }),
    prisma.demoRequest.count(),
    // Clinics that started onboarding themselves on setup.conphident.live.
    // They provision nothing until an operator converts them from here.
    //
    // The table arrives with a migration that runs at deploy time, so an
    // environment that has not migrated yet must still get its portal. This is
    // one optional section — it is never worth taking the whole page down for.
    prisma.clinicSignup
      .findMany({
        where: { status: "NEW" },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
      .catch(() => []),
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
    <main className={`cf-portal min-h-screen ${brandFontVariables} mx-auto flex w-full max-w-[85rem] flex-col gap-5 px-[clamp(1rem,1.5vw,2rem)] py-[clamp(1rem,1.5vw,2rem)]`}>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <Link href="/setup" aria-label="ConphiDent setup portal" className="inline-block">
            <Image
              src="/conphident-logo-transparent.png"
              alt="ConphiDent"
              width={1764}
              height={864}
              priority
              className="h-9 w-auto"
            />
          </Link>
          <p className="portal-kicker mt-6">Onboarding</p>
          <h1 className="mt-2.5 text-[26px] leading-tight font-semibold text-heading">Setup portal</h1>
          <p className="mt-1.5 text-[13.5px] text-text-muted">
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

      {/* One ruled strip rather than four floating tiles: these four numbers are
          a single reading — how the pipeline is distributed — not four cards. */}
      <section
        aria-label="Clinics by phase"
        className="grid divide-y divide-border overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)] sm:grid-cols-4 sm:divide-x sm:divide-y-0"
      >
        {counts.map((phase) => (
          <div key={phase.name} className="px-5 py-4">
            <p className="portal-kicker text-[10px]">{phase.name}</p>
            <p className="mt-2.5 font-[family-name:var(--font-display)] text-[32px] leading-none font-semibold tabular-nums text-heading">
              {phase.count}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              {phase.count === 1 ? "clinic" : "clinics"}
            </p>
          </div>
        ))}
      </section>

      {signups.length > 0 && (
        <section className="overflow-hidden rounded-card border border-border border-l-[3px] border-l-[var(--gold)] bg-card shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-3">
            <h2 className="font-[family-name:var(--font-display)] text-[19px] font-semibold text-heading">
              {signups.length} new {signups.length === 1 ? "clinic has" : "clinics have"} asked to onboard
            </h2>
            <span className="text-xs text-text-muted">From setup.conphident.live</span>
          </div>
          {signups.map((signup) => (
            <div key={signup.id} className="grid gap-x-5 gap-y-2 border-t border-border/70 px-5 py-4 md:grid-cols-[minmax(0,1fr)_16rem_9rem]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{signup.clinicName}</p>
                <p className="text-xs text-text-muted">
                  {signup.contactName} ({signup.role}) · {signup.city} · {signup.dentistCount} dentists, {signup.chairCount} chairs
                </p>
                {signup.priorities && (
                  <p className="mt-1 text-xs text-foreground italic">“{signup.priorities}”</p>
                )}
              </div>
              <div className="min-w-0 text-xs text-text-muted">
                <a href={`mailto:${signup.email}`} className="font-semibold text-primary hover:underline">{signup.email}</a>
                <p>{signup.phone}</p>
                <p>{signup.whatsappNumber ? `WhatsApp: ${signup.whatsappNumber}` : "No WhatsApp number given"}</p>
                <p>{signup.currentSoftware ? `Using: ${signup.currentSoftware}` : "No current system given"}</p>
              </div>
              <div className="text-xs text-text-muted md:text-right">
                <p>{signup.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                <Link href="/platform/clinics/new" className="font-semibold text-primary hover:underline">
                  Create workspace
                </Link>
              </div>
            </div>
          ))}
        </section>
      )}

      {blocked.length > 0 && (
        <section className="rounded-card border border-danger-border bg-card px-5 py-4 shadow-[var(--shadow)]">
          <h2 className="font-[family-name:var(--font-display)] text-[19px] font-semibold text-danger">
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
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="font-[family-name:var(--font-display)] text-[19px] font-semibold text-heading">Where everyone is</h2>
          <Link href="/platform/onboarding" className="text-xs font-semibold text-primary hover:underline">
            Edit stages and notes
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-text-muted">
            No clinics yet. Set one up and it appears here with its progress.
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-x-5 gap-y-2.5 border-t border-border/70 px-5 py-4 md:grid-cols-[minmax(0,1fr)_16rem_9rem]"
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
