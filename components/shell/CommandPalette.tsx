"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Hit = { kind: string; title: string; detail: string; href: string };
type Row = Hit & { hint: string };

const RECENT_KEY = "conphident.palette.recent";
const MAX_RECENT = 6;
const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

/** Things the palette can do as well as find. */
const ACTIONS: Row[] = [
  { kind: "Action", title: "Book a visit", detail: "Opens the booking sheet on Schedule", href: "/dashboard/appointments/new", hint: "Run" },
  { kind: "Action", title: "Add a patient", detail: "Register a walk-in in four fields", href: "/dashboard/patients?add=1", hint: "Run" },
  { kind: "Action", title: "New invoice", detail: "Bill the patient in the chair", href: "/dashboard/billing/new", hint: "Run" },
  { kind: "Action", title: "Start charting", detail: "Open the clinical workspace for a patient", href: "/dashboard/clinical-workspace", hint: "Run" },
  { kind: "Action", title: "Today's huddle brief", detail: "The printable page for the morning stand-up", href: "/dashboard/huddle", hint: "Run" },
];

function readRecent(): Row[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.slice(0, MAX_RECENT) as Row[]) : [];
  } catch {
    return [];
  }
}

function rememberRecent(row: Row) {
  try {
    const next = [row, ...readRecent().filter((item) => item.href !== row.href)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A browser that will not keep recents is no reason to fail the jump.
  }
}

/**
 * Only ever mounted while it is open, so every piece of state starts fresh and
 * there is no reset effect. The debounce lives in the change handler.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listId = useId();

  const [recent] = useState<Row[]>(readRecent);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const actions = q
      ? ACTIONS.filter((action) => `${action.title} ${action.detail}`.toLowerCase().includes(q))
      : ACTIONS;
    if (!q) return [...recent, ...actions];
    return [...hits.map((hit) => ({ ...hit, hint: "Open" })), ...actions];
  }, [query, hits, recent]);

  const activeIndex = Math.min(cursor, Math.max(0, rows.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, rows.length]);

  const run = useCallback(
    (row: Row) => {
      rememberRecent(row);
      onClose();
      router.push(row.href);
    },
    [onClose, router],
  );

  const onQueryChange = (value: string) => {
    setQuery(value);
    setCursor(0);

    if (timerRef.current) window.clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY) {
      setHits([]);
      setSearching(false);
      setFailed(false);
      return;
    }

    setSearching(true);
    setFailed(false);
    timerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { hits: Hit[] };
        setHits(body.hits);
        setSearching(false);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setFailed(true);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor(Math.min(activeIndex + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && rows[activeIndex]) {
      event.preventDefault();
      run(rows[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[95] flex items-start justify-center bg-[rgba(18,59,93,0.35)] px-4 pt-[clamp(1rem,6vh,6rem)] pb-4 backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search or run a command"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[620px] overflow-hidden rounded-card border border-border-strong bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-150"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search className="h-[17px] w-[17px] flex-none text-text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search patients, invoices, or type a command"
            aria-label="Search or run a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-text-muted"
          />
          <kbd className="flex-none rounded-[0.35rem] border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">
            Esc
          </kbd>
        </div>

        <div ref={listRef} id={listId} role="listbox" className="max-h-[52vh] overflow-y-auto">
          {!query.trim() && recent.length > 0 && (
            <p className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
              Where you were
            </p>
          )}

          {rows.map((row, index) => (
            <button
              key={`${row.href}-${index}`}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              data-active={index === activeIndex}
              onClick={() => run(row)}
              onMouseEnter={() => setCursor(index)}
              className={`flex min-h-12 w-full cursor-pointer items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left ${
                index === activeIndex ? "bg-muted" : "bg-card"
              }`}
            >
              <span className="flex-none rounded-[0.35rem] bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-primary uppercase">
                {row.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-heading">{row.title}</span>
                <span className="block truncate text-xs text-text-muted">{row.detail}</span>
              </span>
              <span className="flex-none text-[11px] text-text-muted">{row.hint}</span>
            </button>
          ))}

          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
              <Search className="h-[22px] w-[22px] text-text-muted" strokeWidth={1.8} aria-hidden />
              {searching ? (
                <p className="text-sm font-semibold text-heading">Looking&hellip;</p>
              ) : failed ? (
                <>
                  <p className="text-sm font-semibold text-heading">That search didn&rsquo;t come back</p>
                  <p className="text-[13px] text-text-muted">
                    Your connection dropped. Type another letter to try again.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-heading">
                    Nothing matches &ldquo;{query.trim()}&rdquo;
                  </p>
                  <p className="text-[13px] text-text-muted">
                    Try a phone number, an invoice number, or type &ldquo;book&rdquo;.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {query.trim().length >= MIN_QUERY && (
          <button
            type="button"
            onClick={() =>
              run({
                kind: "Search",
                title: `See everything matching “${query.trim()}”`,
                detail: "Opens the full search",
                href: `/dashboard/search?q=${encodeURIComponent(query.trim())}`,
                hint: "Open",
              })
            }
            className="flex w-full cursor-pointer items-center gap-2 border-t border-border px-4 py-2.5 text-left text-[13px] font-semibold text-primary hover:bg-muted"
          >
            <Search className="h-4 w-4 flex-none" aria-hidden />
            See everything matching &ldquo;{query.trim()}&rdquo;
          </button>
        )}

        <div className="flex flex-wrap gap-3.5 border-t border-border bg-background px-4 py-2 text-[11px] text-text-muted">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
