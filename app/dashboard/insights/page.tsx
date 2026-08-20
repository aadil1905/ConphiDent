export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { rupees } from "@/lib/format";
import {
  chairMetrics,
  changeAgainst,
  growthMetrics,
  moneyMetrics,
  previousRange,
  rangeFor,
  type RangeKey,
} from "@/lib/metrics";
import PageHeader from "@/components/lists/PageHeader";

const BASE = "/dashboard/insights";
const TABS = [
  { key: "money", label: "Money" },
  { key: "chairs", label: "Patients and chairs" },
  { key: "growth", label: "Where patients come from" },
] as const;
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "This year" },
];

// Reads the shared chart tokens rather than a private palette, so these bars
// carry the same five hues (and dark-mode equivalents) as every other chart
// in the workspace instead of the pre-Phase-B heritage teal it used to hardcode.
const BAR_COLOURS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function short(amount: number) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}k`;
  return rupees(amount);
}

function Tile({
  label,
  value,
  change,
  note,
  goodWhenUp = true,
}: {
  label: string;
  value: string;
  change: number | null;
  note: string;
  goodWhenUp?: boolean;
}) {
  const good = change === null ? null : goodWhenUp ? change >= 0 : change <= 0;
  const Icon = change === null ? Minus : change >= 0 ? ArrowUp : ArrowDown;
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">{label}</p>
      <p className="text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums text-heading">{value}</p>
      <p
        className={`flex items-center gap-1.5 text-xs font-semibold ${
          good === null ? "text-text-muted" : good ? "text-success" : "text-danger"
        }`}
      >
        <Icon className="h-3 w-3 flex-none" strokeWidth={2.4} aria-hidden />
        {change === null
          ? "nothing to compare with yet"
          : `${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on the period before`}
      </p>
      <p className="text-xs text-text-muted">{note}</p>
    </div>
  );
}

function Bars({
  title, sub, rows,
}: {
  title: string;
  sub: string;
  rows: Array<{ label: string; value: string; portion: number }>;
}) {
  return (
    <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
      <p className="mb-3 text-xs text-text-muted">{sub}</p>
      <div className="flex flex-col gap-2.5">
        {rows.length === 0 && <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">Nothing to show for this stretch yet.</p>}
        {rows.map((row, index) => (
          <div key={row.label} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2.5 text-[13px]">
              <span>{row.label}</span>
              <span className="font-semibold tabular-nums text-heading">{row.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-muted">
              <div
                className="h-full"
                style={{
                  width: `${Math.max(2, Math.round(row.portion * 100))}%`,
                  background: BAR_COLOURS[index % BAR_COLOURS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string }>;
}) {
  const user = await requirePermission("exportData");
  const params = await searchParams;
  const tab = (TABS.find((item) => item.key === params.tab)?.key ?? "money") as (typeof TABS)[number]["key"];
  const rangeKey = (RANGES.find((item) => item.key === params.range)?.key ?? "month") as RangeKey;

  const now = new Date();
  const range = rangeFor(rangeKey, now);
  const before = previousRange(range);
  const scope = { clinicId: user.clinicId };

  const [money, prevMoney, chairs, prevChairs, growth, prevGrowth] = await Promise.all([
    moneyMetrics(scope, range),
    moneyMetrics(scope, before),
    chairMetrics(scope, range),
    chairMetrics(scope, before),
    growthMetrics(scope, range),
    growthMetrics(scope, before),
  ]);

  const href = (changes: { tab?: string; range?: string }) => {
    const next = new URLSearchParams();
    const nextTab = changes.tab ?? tab;
    const nextRange = changes.range ?? rangeKey;
    if (nextTab !== "money") next.set("tab", nextTab);
    if (nextRange !== "month") next.set("range", nextRange);
    return next.size ? `${BASE}?${next}` : BASE;
  };

  const gap = money.treated - money.collected;
  const oldest = money.ageing[money.ageing.length - 1];
  const busiest = [...chairs.byWeekday].sort((a, b) => b.booked - a.booked)[0];
  const quietest = [...chairs.byWeekday].filter((day) => day.booked > 0).sort((a, b) => a.booked - b.booked)[0];

  const summary = {
    money: `You collected ${short(money.collected)} ${range.label.toLowerCase()} and treated ${short(money.treated)} worth of work. The gap — ${short(Math.max(0, gap))} — is sitting with ${money.owedByPatients} ${money.owedByPatients === 1 ? "patient" : "patients"}${oldest && oldest.amount > 0 ? `, and ${short(oldest.amount)} of it is more than 60 days old` : ""}.`,
    chairs: `You saw ${chairs.patientsSeen} ${chairs.patientsSeen === 1 ? "patient" : "patients"} across ${chairs.workingDays} working ${chairs.workingDays === 1 ? "day" : "days"}, and ${chairs.newPatients} of them were new.${busiest && quietest && busiest.label !== quietest.label ? ` ${busiest.label} is your busiest day and ${quietest.label} your quietest — moving a couple of check-ups across would free up chair time for treatment.` : ""} ${chairs.noShows} ${chairs.noShows === 1 ? "slot went" : "slots went"} empty because people did not turn up.`,
    growth: `${growth.gotInTouch} ${growth.gotInTouch === 1 ? "person" : "people"} got in touch and ${growth.conversionSentence} — ${growth.conversion}%.${growth.sources[0] ? ` ${growth.sources[0].label} brings the most through the door.` : ""}${growth.lossReasons[0] ? ` "${growth.lossReasons[0].label}" was the reason ${growth.lossReasons[0].count} did not come.` : ""}`,
  }[tab];

  const tiles = {
    money: [
      { label: "Collected", value: short(money.collected), change: changeAgainst(money.collected, prevMoney.collected), note: "the money actually in the bank" },
      { label: "Treated", value: short(money.treated), change: changeAgainst(money.treated, prevMoney.treated), note: "work done, paid or not" },
      { label: "Still owed", value: short(money.stillOwed), change: changeAgainst(money.stillOwed, prevMoney.stillOwed), note: `across ${money.owedByPatients} ${money.owedByPatients === 1 ? "patient" : "patients"}`, goodWhenUp: false },
      { label: "Average bill", value: rupees(money.averageBill), change: changeAgainst(money.averageBill, prevMoney.averageBill), note: "per patient who was billed" },
    ],
    chairs: [
      { label: "Patients seen", value: String(chairs.patientsSeen), change: changeAgainst(chairs.patientsSeen, prevChairs.patientsSeen), note: `across ${chairs.workingDays} working days` },
      { label: "New patients", value: String(chairs.newPatients), change: changeAgainst(chairs.newPatients, prevChairs.newPatients), note: "first visit in this stretch" },
      { label: "Visits booked", value: String(chairs.booked), change: changeAgainst(chairs.booked, prevChairs.booked), note: `${chairs.completed} of them were seen` },
      { label: "Did not turn up", value: `${chairs.noShowRate}%`, change: changeAgainst(chairs.noShowRate, prevChairs.noShowRate), note: `${chairs.noShows} empty slots`, goodWhenUp: false },
    ],
    growth: [
      { label: "People got in touch", value: String(growth.gotInTouch), change: changeAgainst(growth.gotInTouch, prevGrowth.gotInTouch), note: "calls, WhatsApp, walk-ins" },
      { label: "Became patients", value: `${growth.conversion}%`, change: changeAgainst(growth.conversion, prevGrowth.conversion), note: growth.conversionSentence },
      { label: "Worth of new patients", value: short(growth.worthOfNewPatients), change: changeAgainst(growth.worthOfNewPatients, prevGrowth.worthOfNewPatients), note: "treated after getting in touch" },
      { label: "Enquiries lost", value: String(growth.lossReasons.reduce((sum, item) => sum + item.count, 0)), change: null, note: growth.lossReasons[0]?.label ?? "no reasons recorded", goodWhenUp: false },
    ],
  }[tab];

  const weekMax = Math.max(1, ...money.weekly.map((week) => Math.max(week.treated, week.collected)));
  const dayMax = Math.max(1, ...chairs.byWeekday.map((day) => day.booked));
  const funnel = [
    { label: "Got in touch", value: growth.gotInTouch, drop: "" },
    { label: "You reached them", value: growth.reached, drop: `${growth.gotInTouch - growth.reached} never answered` },
    { label: "Booked a visit", value: growth.bookedAVisit, drop: `${growth.reached - growth.bookedAVisit} talked but did not book` },
    { label: "Came and were treated", value: growth.treated, drop: `${growth.bookedAVisit - growth.treated} booked but never came` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="How the clinic is doing"
        sub={`${range.label} · every number comes from one shared calculation, so Growth and Money always agree`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((option) => (
              <Link
                key={option.key}
                href={href({ range: option.key })}
                aria-current={rangeKey === option.key ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-control border px-3 text-[13px] font-semibold whitespace-nowrap ${
                  rangeKey === option.key
                    ? "border-primary bg-primary-soft text-heading"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {option.label}
              </Link>
            ))}
            <Link
              href="/dashboard/exports"
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              Export
            </Link>
          </div>
        }
      />

      <div role="tablist" aria-label="Insights sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((option) => (
          <Link
            key={option.key}
            href={href({ tab: option.key })}
            role="tab"
            aria-selected={tab === option.key}
            className={`inline-flex min-h-11 flex-none items-center border-b-2 px-3.5 text-[13px] font-semibold ${
              tab === option.key
                ? "border-b-primary text-heading"
                : "border-b-transparent text-text-muted hover:text-heading"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <section className="rounded-card border border-border border-l-[3px] border-l-primary bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-primary uppercase">The short version</p>
        <p className="max-w-[62rem] text-[15px] text-pretty">{summary}</p>
      </section>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))]">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>

      {tab === "money" && (
        <>
          <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
            <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Treated and collected, week by week</h2>
                <p className="text-xs text-text-muted">
                  Solid is what you collected. Outline is what you treated but have not been paid for.
                </p>
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] bg-primary" aria-hidden />
                  Collected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-[3px] border-2 border-[var(--chart-2)]" aria-hidden />
                  Treated, unpaid
                </span>
              </div>
            </div>
            <div className="flex h-[200px] items-end gap-2.5">
              {money.weekly.length === 0 && (
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">Nothing billed in this stretch yet.</p>
              )}
              {money.weekly.map((week) => (
                <div
                  key={week.label}
                  title={`${week.label}: treated ${rupees(week.treated)}, collected ${rupees(week.collected)}`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
                >
                  <span className="text-center text-[11px] tabular-nums text-text-muted">
                    {short(week.treated)}
                  </span>
                  <div className="flex h-full items-end justify-center gap-[3px]">
                    <div
                      className="w-[40%] rounded-t-[3px] bg-primary"
                      style={{ height: `${Math.round((week.collected / weekMax) * 100)}%` }}
                    />
                    <div
                      className="w-[40%] rounded-t-[3px] border-2 border-b-0 border-[var(--chart-2)] bg-muted"
                      style={{
                        height: `${Math.round((Math.max(0, week.treated - week.collected) / weekMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-center text-xs text-text-muted">{week.label}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            <Bars
              title="What brought the money in"
              sub="Treatments billed in this stretch, biggest earner first."
              rows={money.procedures.map((item) => ({
                label: `${item.name} × ${item.count}`,
                value: rupees(item.amount),
                portion: item.amount / Math.max(1, money.procedures[0]?.amount ?? 1),
              }))}
            />

            <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
              <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Money still with patients</h2>
              <p className="mb-3 text-xs text-text-muted">The longer it sits, the harder it gets.</p>
              <div className="flex flex-col gap-2">
                {money.ageing.map((bucket) => (
                  <div
                    key={bucket.label}
                    className="flex justify-between gap-3 border-b border-border/70 py-2 text-[13px] last:border-b-0"
                  >
                    <span>{bucket.label}</span>
                    <span className="flex items-baseline gap-2.5">
                      <span className="text-xs text-text-muted">
                        {bucket.count} {bucket.count === 1 ? "invoice" : "invoices"}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          bucket.tone === "danger"
                            ? "text-danger"
                            : bucket.tone === "warning"
                              ? "text-warning"
                              : "text-heading"
                        }`}
                      >
                        {rupees(bucket.amount)}
                      </span>
                    </span>
                  </div>
                ))}
                <Link
                  href="/dashboard/billing?show=overdue"
                  className="mt-1 inline-flex min-h-11 items-center justify-center rounded-control border border-primary bg-primary text-[13px] font-semibold text-white hover:bg-primary-hover"
                >
                  Open the list to chase
                </Link>
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "chairs" && (
        <>
          <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Chairs filled, day by day</h2>
            <p className="mb-3.5 text-xs text-text-muted">
              Booked visits across the whole stretch, added up by weekday.
            </p>
            <div className="flex h-[180px] items-end gap-2.5">
              {chairs.byWeekday.map((day) => (
                <div
                  key={day.label}
                  title={`${day.label}: ${day.booked} booked, ${day.completed} seen`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
                >
                  <span className="text-center text-[11px] tabular-nums text-text-muted">{day.booked}</span>
                  <div
                    className={`rounded-t-[4px] ${
                      day.booked / dayMax > 0.9
                        ? "bg-primary"
                        : day.booked / dayMax < 0.65
                          ? "bg-[var(--chart-3)]"
                          : "bg-[var(--chart-2)]"
                    }`}
                    style={{ height: `${Math.round((day.booked / dayMax) * 100)}%` }}
                  />
                  <span className="text-center text-xs text-text-muted">{day.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Empty chairs cost you</h2>
            <p className="mb-3 text-xs text-text-muted">Missed and cancelled visits in this stretch.</p>
            <div className="flex flex-col gap-2">
              {[
                { label: "Did not turn up", value: `${chairs.noShows} slots`, tone: "text-danger" },
                { label: "Cancelled", value: `${chairs.cancelled} slots`, tone: "text-warning" },
                { label: "Seen as booked", value: `${chairs.completed} visits`, tone: "text-success" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between gap-3 border-b border-border/70 py-2 text-[13px] last:border-b-0"
                >
                  <span>{row.label}</span>
                  <span className={`font-semibold tabular-nums ${row.tone}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "growth" && (
        <>
          <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">From enquiry to treated</h2>
            <p className="mb-3.5 text-xs text-text-muted">
              The same numbers as the Growth queue — one calculation, used everywhere.
            </p>
            <div className="flex flex-col gap-3">
              {funnel.map((step, index) => (
                <div key={step.label} className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
                    <div className="flex justify-between gap-2.5 text-[13px]">
                      <span className="font-semibold">{step.label}</span>
                      <span className="font-bold tabular-nums text-heading">{step.value}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-pill bg-muted">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.round((step.value / Math.max(1, growth.gotInTouch)) * 100)}%`,
                          background: BAR_COLOURS[index % BAR_COLOURS.length],
                        }}
                      />
                    </div>
                  </div>
                  <p className="min-w-[190px] flex-none text-xs text-text-muted">{step.drop}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
            <section className="overflow-x-auto rounded-card border border-border bg-card shadow-[var(--shadow)]">
              <div className="px-5.5 pt-4 pb-2.5">
                <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Which sources are worth it</h2>
                <p className="text-xs text-text-muted">Sorted by how many actually got treated.</p>
              </div>
              <div className="min-w-[460px]">
                <div className="grid grid-cols-[minmax(120px,1fr)_100px_100px_120px] gap-3 border-b border-border bg-muted px-5.5 py-2.5 text-[11px] font-semibold tracking-[0.14em] text-text-muted uppercase">
                  <span>Where from</span>
                  <span>Enquiries</span>
                  <span>Treated</span>
                  <span>Worth</span>
                </div>
                {growth.sources.length === 0 && (
                  <p className="px-5.5 py-6 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                    Nobody has got in touch in this stretch.
                  </p>
                )}
                {growth.sources.map((source) => (
                  <div
                    key={source.label}
                    className="grid grid-cols-[minmax(120px,1fr)_100px_100px_120px] items-center gap-3 border-b border-border/70 px-5.5 py-2.5 text-[13px] last:border-b-0"
                  >
                    <span className="font-semibold text-heading">{source.label}</span>
                    <span className="tabular-nums text-text-muted">{source.enquiries}</span>
                    <span className="tabular-nums">{source.treated}</span>
                    <span className="font-semibold tabular-nums text-heading">{rupees(source.worth)}</span>
                  </div>
                ))}
              </div>
            </section>

            <Bars
              title="Why people did not come"
              sub="From the reason your team picks when closing someone off the queue."
              rows={growth.lossReasons.map((reason) => ({
                label: reason.label,
                value: String(reason.count),
                portion: reason.count / Math.max(1, growth.lossReasons[0]?.count ?? 1),
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
