export const dynamic = "force-dynamic";

import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { searchWorkspace, type SearchHit } from "@/lib/workspace-search";
import PageHeader from "@/components/lists/PageHeader";

const KIND_ORDER = ["Patient", "Visit", "Invoice", "Enquiry", "Lab", "Message", "Plan", "Prescription"];

export default async function FindAnythingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const query = (await searchParams).q?.trim() ?? "";
  const hits = query ? await searchWorkspace({ clinicId: user.clinicId, role: user.role }, query) : [];

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader
        title="Find anything"
        sub="Patients, visits, invoices, lab cases and messages — everything your role can see."
      />

      <form className="flex gap-2.5">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-border bg-card px-3">
          <Search className="h-4 w-4 flex-none text-text-muted" aria-hidden />
          <span className="sr-only">Search the workspace</span>
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Name, phone, invoice number, medicine, lab or something someone said"
            className="min-h-12 w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-text-muted"
          />
        </label>
        <button className="min-h-12 cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
          Search
        </button>
      </form>

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        {!query ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Search className="h-7 w-7 text-text-muted" strokeWidth={1.6} aria-hidden />
            <p className="text-[15px] font-semibold text-heading">Type something to look for</p>
            <p className="max-w-[32rem] text-[13px] text-text-muted">
              A phone number usually finds someone fastest. Press ⌘K anywhere in the workspace to search
              without leaving the page you are on.
            </p>
          </div>
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <Search className="h-7 w-7 text-text-muted" strokeWidth={1.6} aria-hidden />
            <p className="text-[15px] font-semibold text-heading">Nothing matches &ldquo;{query}&rdquo;</p>
            <p className="max-w-[32rem] text-[13px] text-text-muted">
              Try a phone number, an invoice number, or fewer letters.
            </p>
            <Link
              href="/dashboard/patients?add=1"
              className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Add them as a new patient
            </Link>
          </div>
        ) : (
          grouped.map((group) => (
            <section key={group.kind}>
              <h2 className="border-b border-border bg-muted px-4 py-2 text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                {group.kind === "Visit"
                  ? "Visits"
                  : group.kind === "Lab"
                    ? "Lab cases"
                    : group.kind === "Plan"
                      ? "Treatment plans"
                      : `${group.kind}s`}
              </h2>
              {group.items.map((hit: SearchHit, index) => (
                <Link
                  key={`${hit.href}-${index}`}
                  href={hit.href}
                  className="block border-b border-border/70 px-4 py-3 last:border-b-0 hover:bg-primary-soft"
                >
                  <p className="text-sm font-semibold text-heading">{hit.title}</p>
                  <p className="text-[13px] text-text-muted">{hit.detail}</p>
                </Link>
              ))}
            </section>
          ))
        )}
      </section>

      {query && hits.length > 0 && (
        <p className="text-xs text-text-muted">
          Showing {hits.length} {hits.length === 1 ? "match" : "matches"} across{" "}
          {grouped.length} {grouped.length === 1 ? "place" : "places"}.
        </p>
      )}
    </div>
  );
}
