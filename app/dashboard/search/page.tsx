export const dynamic = "force-dynamic";

import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { searchWorkspace, type SearchHit } from "@/lib/workspace-search";
import { WORKSPACE_ACTIONS } from "@/lib/workspace-actions";
import WorkPage from "@/components/lists/WorkPage";
import RecentlyOpened from "@/components/search/RecentlyOpened";

const KIND_ORDER = ["Patient", "Visit", "Invoice", "Enquiry", "Lab", "Message", "Plan", "Prescription"];

const KIND_TITLES: Record<string, string> = {
  Patient: "Patients",
  Visit: "Visits",
  Invoice: "Bills",
  Enquiry: "Enquiries",
  Lab: "Lab cases",
  Message: "Messages",
  Plan: "Treatment plans",
  Prescription: "Prescriptions",
};

export default async function FindAnythingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const scope = KIND_ORDER.includes(params.kind ?? "") ? (params.kind as string) : "";

  const hits = query ? await searchWorkspace({ clinicId: user.clinicId, role: user.role }, query) : [];
  const inScope = scope ? hits.filter((hit) => hit.kind === scope) : hits;

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: inScope.filter((hit) => hit.kind === kind),
  })).filter((group) => group.items.length > 0);

  const scopeHref = (kind: string) => {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (kind) next.set("kind", kind);
    const search = next.toString();
    return search ? `/dashboard/search?${search}` : "/dashboard/search";
  };

  // Only offer to narrow to somewhere that actually has something in it.
  const scopes = [
    { value: "", label: "Everything", count: hits.length },
    ...KIND_ORDER.map((kind) => ({
      value: kind,
      label: KIND_TITLES[kind] ?? kind,
      count: hits.filter((hit) => hit.kind === kind).length,
    })).filter((option) => option.count > 0),
  ];

  return (
    <WorkPage
      title="Find anything"
      sub="Press Ctrl-K or ⌘K from any screen — you never have to come here first."
    >
      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]">
        <form className="flex gap-2.5">
          {scope && <input type="hidden" name="kind" value={scope} />}
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border-strong bg-card px-3.5">
            <Search className="h-4 w-4 flex-none text-text-muted" aria-hidden />
            <span className="sr-only">Search patients, bills, visits and notes</span>
            <input
              name="q"
              defaultValue={query}
              autoFocus
              placeholder="A name, a number, a bill, or what you want to do"
              className="min-h-13 w-full border-0 bg-transparent text-base text-foreground outline-none placeholder:text-text-muted"
            />
          </label>
          <button className="min-h-13 cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
            Search
          </button>
        </form>

        {query && hits.length > 0 && (
          <div role="group" aria-label="Only look in" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-muted">Only look in:</span>
            {scopes.map((option) => {
              const active = scope === option.value;
              return (
                <Link
                  key={option.value || "all"}
                  href={scopeHref(option.value)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold whitespace-nowrap ${
                    active
                      ? "border-primary bg-primary-soft text-heading"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                  <span className="tabular-nums text-text-muted">{option.count}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {!query && (
        <>
          <RecentlyOpened />

          <section className="rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Or just start something</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              The same list ⌘K offers, if you would rather click than type.
            </p>
            <div className="mt-2.5 grid gap-1 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
              {WORKSPACE_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex min-h-12 items-center rounded-control px-2.5 py-2 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-heading">{action.title}</span>
                    <span className="block truncate text-xs text-text-muted">{action.detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {query && inScope.length === 0 && (
        <section className="flex flex-col items-center gap-2 rounded-card border border-border bg-card px-4 py-12 text-center shadow-[var(--shadow)]">
          <Search className="h-7 w-7 text-text-muted" strokeWidth={1.6} aria-hidden />
          <p className="text-[15px] font-semibold text-heading">
            Nothing matches &ldquo;{query}&rdquo;
            {scope ? ` in ${(KIND_TITLES[scope] ?? scope).toLowerCase()}` : ""}
          </p>
          <p className="max-w-[32rem] text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            {scope
              ? "It may be somewhere else — look in everything."
              : "Try a phone number, or part of a bill number. If they are new to you, add them now."}
          </p>
          <div className="mt-1.5 flex flex-wrap justify-center gap-2">
            {scope ? (
              <Link
                href={scopeHref("")}
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
              >
                Look in everything
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard/patients?add=1"
                  className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
                >
                  Add them as a new patient
                </Link>
                <Link
                  href="/dashboard/growth?log=1"
                  className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
                >
                  Log them as an enquiry
                </Link>
              </>
            )}
          </div>
        </section>
      )}

      {grouped.map((group) => (
        <section
          key={group.kind}
          className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-3.5 pb-2.5">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">
              {KIND_TITLES[group.kind] ?? group.kind}
            </h2>
            <span className="text-xs text-text-muted">
              {group.items.length} {group.items.length === 1 ? "match" : "matches"}
            </span>
          </div>
          {group.items.map((hit: SearchHit, index) => (
            <Link
              key={`${hit.href}-${index}`}
              href={hit.href}
              className="block border-t border-border/70 px-5.5 py-3 hover:bg-primary-soft"
            >
              <p className="text-sm font-semibold text-heading">{hit.title}</p>
              <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{hit.detail}</p>
            </Link>
          ))}
        </section>
      ))}

      {query && inScope.length > 0 && (
        <p className="text-xs text-text-muted">
          Showing {inScope.length} {inScope.length === 1 ? "match" : "matches"} across {grouped.length}{" "}
          {grouped.length === 1 ? "place" : "places"}.
        </p>
      )}
    </WorkPage>
  );
}
