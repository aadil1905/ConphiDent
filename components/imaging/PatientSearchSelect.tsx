"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

export type PatientSearchOption = { id: number; label: string };

export default function PatientSearchSelect({
  name,
  initialSelected = null,
  required = false,
  onSelect,
}: {
  name: string;
  initialSelected?: PatientSearchOption | null;
  required?: boolean;
  onSelect?: (option: PatientSearchOption | null) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PatientSearchOption[]>([]);
  const [selected, setSelected] = useState<PatientSearchOption | null>(initialSelected);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const open = !selected && query.trim().length >= 2;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/imaging/patient-search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "That search didn't work — try again.");
        setOptions(payload.patients || []);
        setActiveIndex(-1);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "That search didn't work — try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function choose(option: PatientSearchOption) {
    setSelected(option);
    setQuery("");
    setOptions([]);
    setActiveIndex(-1);
    onSelect?.(option);
  }

  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !options.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === "Escape") {
      setQuery("");
      setOptions([]);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected?.id || ""} required={required} />
      {selected ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-control border border-primary bg-secondary px-3 text-sm text-heading">
          <span className="font-semibold">{selected.label}</span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              onSelect?.(null);
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            aria-label="Pick someone else"
            className="cursor-pointer rounded-chip p-1 hover:bg-secondary-hover"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">Search patients</span>
            <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-text-muted" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (nextQuery.trim().length < 2) {
                  setOptions([]);
                  setActiveIndex(-1);
                  setLoading(false);
                  setError("");
                }
              }}
              onKeyDown={keyDown}
              placeholder="Type a name or number"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={activeIndex >= 0 ? `${listId}-${options[activeIndex]?.id}` : undefined}
              className="min-h-11 w-full rounded-control border border-border bg-card pr-10 pl-10 text-sm font-normal text-foreground outline-none"
            />
            {loading ? <LoaderCircle className="absolute top-3.5 right-3 size-4 animate-spin text-primary" aria-hidden /> : null}
          </label>
          {open ? (
            <div
              id={listId}
              role="listbox"
              aria-label="Patients found"
              className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-control border border-border bg-card p-1 shadow-[var(--shadow-overlay)]"
            >
              {options.map((option, index) => (
                <button
                  id={`${listId}-${option.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  key={option.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`block w-full cursor-pointer rounded-chip px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-secondary-hover text-heading" : "hover:bg-muted"}`}
                >
                  {option.label}
                </button>
              ))}
              {!loading && !options.length ? <p className="p-3 text-xs text-text-muted">Nobody by that name here.</p> : null}
            </div>
          ) : null}
          {open && error ? (
            <p role="alert" className="mt-1 text-xs text-danger">{error}</p>
          ) : (
            <p className="mt-1 text-xs font-normal text-text-muted">Nothing shows until you type — the patient list stays closed.</p>
          )}
        </>
      )}
    </div>
  );
}
