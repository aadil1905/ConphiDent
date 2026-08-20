/**
 * Every list in the workspace reads its state from the URL, so a filtered view
 * can be bookmarked, shared, and survives the back button.
 */

export const PAGE_SIZES = [30, 60, 120] as const;
export const DEFAULT_PAGE_SIZE = 30;

export type ListQuery = {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  size: number;
  /** Anything screen-specific: status, owner, source. */
  filters: Record<string, string>;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseListQuery(
  params: RawSearchParams,
  options: { defaultSort: string; defaultDir?: "asc" | "desc"; filterKeys?: readonly string[] },
): ListQuery {
  const page = Math.max(1, Number.parseInt(one(params.page), 10) || 1);
  const requestedSize = Number.parseInt(one(params.size), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;
  const dirParam = one(params.dir);

  const filters: Record<string, string> = {};
  for (const key of options.filterKeys ?? []) {
    const value = one(params[key]);
    if (value) filters[key] = value;
  }

  return {
    q: one(params.q),
    sort: one(params.sort) || options.defaultSort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : (options.defaultDir ?? "desc"),
    page,
    size,
    filters,
  };
}

/** Rebuilds the query string with `changes` applied; anything set to "" drops out. */
export function listHref(
  basePath: string,
  query: ListQuery,
  changes: Partial<Record<string, string | number>> = {},
) {
  const params = new URLSearchParams();
  const merged: Record<string, string | number> = {
    q: query.q,
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    size: query.size,
    ...query.filters,
    ...changes,
  };

  for (const [key, value] of Object.entries(merged)) {
    const text = String(value ?? "");
    if (!text) continue;
    if (key === "page" && text === "1") continue;
    if (key === "size" && text === String(DEFAULT_PAGE_SIZE)) continue;
    params.set(key, text);
  }

  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** "Showing 30 of 214" — and never a bare `take: 30` again. */
export function showingLine(shown: number, total: number, noun: string) {
  if (total === 0) return `No ${noun} yet`;
  if (shown >= total) return `Showing all ${total} ${total === 1 ? noun.replace(/s$/, "") : noun}`;
  return `Showing ${shown} of ${total} ${noun}`;
}

export function pageCount(total: number, size: number) {
  return Math.max(1, Math.ceil(total / size));
}

/** Prisma skip/take straight from the parsed query. */
export function pageWindow(query: ListQuery, total: number) {
  const pages = pageCount(total, query.size);
  const page = Math.min(query.page, pages);
  return { skip: (page - 1) * query.size, take: query.size, page, pages };
}
