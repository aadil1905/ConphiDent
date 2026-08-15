"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { MAX_RECENT, RECENT_KEY } from "@/lib/workspace-actions";

type Recent = { kind: string; title: string; detail: string; href: string };

const NONE: Recent[] = [];
let cachedRaw: string | null = null;
let cachedRows: Recent[] = NONE;

/** Parsed once per distinct stored value, so the snapshot stays referentially stable. */
function readRecent() {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(RECENT_KEY);
  if (raw === cachedRaw) return cachedRows;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    cachedRows = Array.isArray(parsed) ? (parsed.slice(0, MAX_RECENT) as Recent[]) : NONE;
  } catch {
    cachedRows = NONE;
  }
  return cachedRows;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function initialsOf(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/**
 * The same list the ⌘K palette keeps, shown on the page for anyone who came
 * here rather than reaching for the shortcut. It lives in the browser, so it
 * never leaves the machine it was opened on.
 */
export default function RecentlyOpened() {
  // The server has no localStorage, so it renders the empty list and React
  // swaps in the real one on hydration — no mismatch, and no effect.
  const rows = useSyncExternalStore(subscribe, readRecent, () => NONE);

  return (
    <section className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
      <h2 className="text-base font-semibold text-heading">You looked at these recently</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-[13px] text-text-muted">
          Nothing yet on this device. Whatever you open from here or from ⌘K turns up in this list.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1">
          {rows.map((row) => (
            <Link
              key={row.href}
              href={row.href}
              className="flex min-h-12 items-center gap-2.5 rounded-control px-2.5 py-2 hover:bg-muted"
            >
              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-pill bg-secondary text-[11px] font-bold text-heading">
                {initialsOf(row.title)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-heading">{row.title}</span>
                <span className="block truncate text-xs text-text-muted">{row.detail}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
