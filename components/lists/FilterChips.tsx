import Link from "next/link";
import { listHref, type ListQuery } from "@/lib/list-params";

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
  /** Colours the count when the number itself is the warning — overdue work. */
  tone?: "danger";
};

/**
 * URL-persisted filters as links, so they work before the JavaScript lands and
 * a filtered view can be shared as-is.
 */
export default function FilterChips({
  basePath,
  query,
  name,
  legend,
  options,
}: {
  basePath: string;
  query: ListQuery;
  name: string;
  legend: string;
  options: readonly FilterOption[];
}) {
  const current = query.filters[name] ?? "";

  return (
    <div role="group" aria-label={legend} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = current === option.value;
        return (
          <Link
            key={option.value || "all"}
            href={listHref(basePath, query, { [name]: active ? "" : option.value, page: 1 })}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap ${
              active
                ? "border-primary bg-primary-soft text-heading"
                : "border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {option.label}
            {typeof option.count === "number" && (
              <span
                className={`tabular-nums ${
                  option.tone === "danger" && option.count > 0 ? "text-danger" : "text-text-muted"
                }`}
              >
                {option.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
