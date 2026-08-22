import Link from "next/link";
import { Suspense } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { listHref, pageCount, showingLine, PAGE_SIZES, type ListQuery } from "@/lib/list-params";
import PageSize from "./PageSize";

export type ListColumn = {
  key: string;
  label: string;
  /** Omit to make the column unsortable. */
  sortKey?: string;
  align?: "left" | "right";
  /** Hidden below sm so narrow screens keep the columns that matter. */
  secondary?: boolean;
  width?: string;
};

type DataListProps = {
  basePath: string;
  query: ListQuery;
  columns: readonly ListColumn[];
  total: number;
  shown: number;
  noun: string;
  children: React.ReactNode;
  /** Rendered instead of the table when there is nothing to show. */
  empty?: React.ReactNode;
};

function SortHeader({
  column,
  basePath,
  query,
}: {
  column: ListColumn;
  basePath: string;
  query: ListQuery;
}) {
  if (!column.sortKey) return <>{column.label}</>;

  const active = query.sort === column.sortKey;
  const nextDir = active && query.dir === "asc" ? "desc" : "asc";
  const Icon = active ? (query.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    // The visible header is 11.5px uppercase text — the target sorting is the
    // only way to reorder every list in the product has to reach 44px anyway.
    // -py-3 cancels the th's own padding so the link's box, not the text,
    // carries the height.
    <Link
      href={listHref(basePath, query, { sort: column.sortKey, dir: nextDir, page: 1 })}
      aria-label={`Sort by ${column.label}, ${nextDir === "asc" ? "smallest first" : "largest first"}`}
      className="-my-3 inline-flex min-h-11 items-center gap-1 py-3 text-inherit hover:text-heading"
    >
      {column.label}
      <Icon className={`h-3 w-3 ${active ? "text-primary" : "text-text-muted/60"}`} aria-hidden />
    </Link>
  );
}

/**
 * The one list shell: sortable headers that survive a reload, an honest total
 * in the footer, and real pages rather than a silent `take: 30`.
 */
export default function DataList({
  basePath,
  query,
  columns,
  total,
  shown,
  noun,
  children,
  empty,
}: DataListProps) {
  const pages = pageCount(total, query.size);
  const page = Math.min(query.page, pages);

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
      {total === 0 ? (
        <div>{empty}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[length:var(--text-dense)] leading-[var(--text-dense-lh)]">
              <thead>
                <tr className="bg-muted text-left">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      aria-sort={
                        column.sortKey && query.sort === column.sortKey
                          ? query.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                      className={`border-b-2 border-border px-5 py-3 text-[length:var(--text-micro)] font-bold tracking-[0.14em] whitespace-nowrap text-heading uppercase ${
                        column.align === "right" ? "text-right" : "text-left"
                      } ${column.secondary ? "hidden sm:table-cell" : ""}`}
                    >
                      <SortHeader column={column} basePath={basePath} query={query} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-[length:var(--text-secondary)] text-text-muted">
            <span>{showingLine(shown, total, noun)}</span>
            <div className="flex flex-wrap items-center gap-3">
              {total > PAGE_SIZES[0] && (
                <Suspense fallback={null}>
                  <PageSize value={query.size} />
                </Suspense>
              )}
              {pages > 1 && (
              <nav aria-label="Pages" className="flex items-center gap-1">
                <Link
                  href={listHref(basePath, query, { page: page - 1 })}
                  aria-disabled={page <= 1}
                  className={`inline-flex min-h-11 items-center rounded-control border border-border px-3 font-semibold ${
                    page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
                  }`}
                >
                  Back
                </Link>
                <span className="px-2 tabular-nums">
                  Page {page} of {pages}
                </span>
                <Link
                  href={listHref(basePath, query, { page: page + 1 })}
                  aria-disabled={page >= pages}
                  className={`inline-flex min-h-11 items-center rounded-control border border-border px-3 font-semibold ${
                    page >= pages ? "pointer-events-none opacity-40" : "hover:bg-muted"
                  }`}
                >
                  Next
                </Link>
              </nav>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * A row that carries a 3px stroke down its left edge when it needs attention.
 *
 * Positioned, so that the one `ListLink` inside it can stretch its hit area
 * over the whole row — see `ListLink`.
 */
export function ListRow({
  needsAttention,
  children,
}: {
  needsAttention?: boolean;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={`relative border-b border-border/70 last:border-b-0 hover:bg-primary-soft ${
        needsAttention ? "border-l-[3px] border-l-danger-mark" : ""
      }`}
    >
      {children}
    </tr>
  );
}

export function ListCell({
  align,
  secondary,
  /**
   * The cell holding this row's `ListLink`. It changes no styling — it marks,
   * in the markup and in the DOM, which cell carries the whole row.
   */
  primary,
  /**
   * This cell has its own link or button. It is lifted above the row link's
   * overlay so that control is still its own target rather than being
   * swallowed by the row's.
   *
   * Only set it where it is true. A plain text cell lifted for no reason is a
   * hole in the row's hit area — which is the whole point of the overlay — and
   * the hole is invisible, because the row still works everywhere else.
   */
  interactive,
  className = "",
  children,
}: {
  align?: "left" | "right";
  secondary?: boolean;
  primary?: boolean;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <td
      data-primary={primary ? "" : undefined}
      className={`px-5 py-3.5 align-middle ${interactive ? "relative z-10" : ""} ${
        align === "right" ? "text-right" : "text-left"
      } ${secondary ? "hidden sm:table-cell" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * The one link that opens what a row is about, with the whole row as its target.
 *
 * A row is about 73px tall and the name inside it is about 20px, so roughly
 * three quarters of what reads as tappable was not — a real miss for a gloved
 * hand on a tablet beside the chair, and invisible in review because the link
 * does work if you hit it.
 *
 * The overlay is a pseudo-element rather than a wrapping anchor because a table
 * row cannot contain one anchor spanning several cells. It resolves against
 * `ListRow`, which is why the cell holding it must be the `primary` one: a
 * positioned cell would trap the overlay inside that single column. Every other
 * cell sits at `z-10` so a second link or a button in the row is still its own
 * target rather than being swallowed by the row's.
 *
 * Text selection still works — the overlay is transparent and only takes the
 * pointer on a click, the same as any link laid over a card.
 *
 * Which cell to mark `primary`: the one that identifies the row, and it has to
 * be visible at every width — a `secondary` cell is `display: none` below `sm`,
 * which would leave the row with no target on exactly the narrow screen the big
 * target is for. Where the identifying cell is hidden or is not a link, the
 * trailing action cell carries the row instead; the lab list does that.
 */
export function ListLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `data-row-link` opts this anchor out of the workspace's global
    // `transform: translateZ(0)` on links. A transformed element is a
    // containing block for its absolutely positioned descendants, so with it
    // the overlay below resolves against this anchor instead of the row and
    // quietly collapses to the width of the text — which is the bug this
    // component exists to fix. See the rule in `globals.css`.
    <Link
      href={href}
      data-row-link
      className={`after:absolute after:inset-0 after:content-[''] ${className}`}
    >
      {children}
    </Link>
  );
}
