"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pill } from "lucide-react";
import type { FormularyEntry } from "@/app/api/formulary/route";

const DEBOUNCE_MS = 250;

/** A short starter list so a brand-new clinic is not typing into a void. */
const STARTERS: FormularyEntry[] = [
  { genericName: "Amoxicillin", strength: "500 mg", dosageForm: "Capsule", doseUnit: "capsule", route: "Oral", frequency: "Three times daily", duration: "5 days", used: 0 },
  { genericName: "Amoxicillin + Clavulanate", strength: "625 mg", dosageForm: "Tablet", doseUnit: "tablet", route: "Oral", frequency: "Twice daily", duration: "5 days", used: 0 },
  { genericName: "Metronidazole", strength: "400 mg", dosageForm: "Tablet", doseUnit: "tablet", route: "Oral", frequency: "Three times daily", duration: "5 days", used: 0 },
  { genericName: "Ibuprofen", strength: "400 mg", dosageForm: "Tablet", doseUnit: "tablet", route: "Oral", frequency: "Three times daily", duration: "3 days", used: 0 },
  { genericName: "Paracetamol", strength: "650 mg", dosageForm: "Tablet", doseUnit: "tablet", route: "Oral", frequency: "Three times daily", duration: "3 days", used: 0 },
  { genericName: "Chlorhexidine mouthwash", strength: "0.2%", dosageForm: "Rinse", doseUnit: "10 ml", route: "Topical", frequency: "Twice daily", duration: "7 days", used: 0 },
];

/**
 * One combobox that resolves generic + strength + form in a single keystroke
 * sequence, with what this clinic actually prescribes at the top. It replaces
 * three of the fourteen free-text boxes a medicine used to need.
 */
export default function MedicineCombobox({
  value,
  onPick,
  onType,
}: {
  value: string;
  onPick: (entry: FormularyEntry) => void;
  onType: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<FormularyEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const timer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const look = (text: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/formulary?q=${encodeURIComponent(text.trim())}`);
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { entries: FormularyEntry[] };
        const starters = STARTERS.filter((entry) =>
          entry.genericName.toLowerCase().includes(text.trim().toLowerCase()),
        );
        const seen = new Set(body.entries.map((entry) => entry.genericName.toLowerCase()));
        setEntries([...body.entries, ...starters.filter((entry) => !seen.has(entry.genericName.toLowerCase()))]);
      } catch {
        // Falling back to the starter list beats an empty box.
        setEntries(STARTERS.filter((entry) => entry.genericName.toLowerCase().includes(text.trim().toLowerCase())));
      }
    }, DEBOUNCE_MS);
  };

  const choose = (entry: FormularyEntry) => {
    onPick(entry);
    setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-heading">Medicine</span>
        <span className="relative flex items-center">
          <Pill className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden />
          <input
            value={value}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Start typing — e.g. amox"
            onChange={(event) => {
              onType(event.target.value);
              setCursor(0);
              setOpen(true);
              look(event.target.value);
            }}
            onFocus={() => {
              setOpen(true);
              look(value);
            }}
            onKeyDown={(event) => {
              if (!open || entries.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor(Math.min(cursor + 1, entries.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor(Math.max(cursor - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(entries[cursor]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
            className="min-h-11 w-full rounded-control border border-border bg-card pr-3 pl-9 text-sm text-foreground"
          />
        </span>
        <span className="text-xs font-normal text-text-muted">
          Picking one fills in the strength and the form together.
        </span>
      </label>

      {open && entries.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-control border border-border-strong bg-card shadow-[var(--shadow-overlay)]"
        >
          {entries.map((entry, index) => (
            <li key={`${entry.genericName}-${entry.strength}-${index}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(entry)}
                className={`flex w-full cursor-pointer items-baseline justify-between gap-3 border-b border-border/70 px-3 py-2.5 text-left last:border-b-0 ${
                  index === cursor ? "bg-muted" : "bg-card"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-heading">
                    {entry.genericName} {entry.strength}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {entry.dosageForm} · {entry.frequency} · {entry.duration}
                  </span>
                </span>
                {entry.used > 0 && (
                  <span className="flex-none text-[11px] whitespace-nowrap text-text-muted">
                    used {entry.used}×
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
