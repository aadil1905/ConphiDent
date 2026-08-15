"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { PatientMatch } from "@/app/api/patients/lookup/route";

const DRAFT_KEY = "conphident.booking.draft";
const DEBOUNCE_MS = 250;
const UNDO_MS = 8000;

export type BookableDay = {
  /** yyyy-mm-dd */
  iso: string;
  dow: string;
  date: string;
  label: string;
  /** "09:00", "09:30" — from this clinic's own hours. */
  slots: string[];
  /** "11 booked · 4 free times" */
  glance: string;
};

type Draft = { who: string; note: string; reason: string; iso: string; slot: string | null };

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** "14:30" → "2:30 pm" */
function pretty(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const meridiem = hour < 12 ? "am" : "pm";
  return `${((hour + 11) % 12) + 1}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/**
 * Two kinds of visit, not a list of treatments. What is being treated belongs on
 * the clinical note; what the desk needs to know is whether this person's
 * details have ever been taken. The API already reads "New consultation" to
 * decide whether intake is outstanding.
 */
const VISIT_TYPES = [
  { value: "New consultation", note: "We take their details next" },
  { value: "Follow-up", note: "Straight to their file" },
] as const;

const card = "rounded-card border border-border bg-card shadow-[var(--shadow)]";
const chip = (on: boolean) =>
  `cursor-pointer rounded-control border text-heading ${on ? "border-primary bg-secondary" : "border-border-strong bg-card"}`;

export default function BookAVisit({
  days,
  chairs,
  defaultIso,
  defaultTime,
  defaultPatientName,
  defaultPhone,
}: {
  days: BookableDay[];
  chairs: string[];
  defaultIso?: string;
  defaultTime?: string;
  defaultPatientName?: string;
  defaultPhone?: string;
}) {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  const [draft] = useState(readDraft);
  const [who, setWho] = useState(defaultPatientName ?? "");
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [picked, setPicked] = useState<PatientMatch | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");

  const startIndex = Math.max(0, days.findIndex((day) => day.iso === defaultIso));
  const [dayIndex, setDayIndex] = useState(startIndex);
  const [slot, setSlot] = useState<string | null>(defaultTime ?? null);

  const [reason, setReason] = useState<string>(VISIT_TYPES[0].value);
  const [note, setNote] = useState("");
  const [remind, setRemind] = useState(true);

  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [draftOffered, setDraftOffered] = useState(Boolean(draft?.who));

  const day = days[Math.min(dayIndex, days.length - 1)];
  const chosen = slot ? pretty(slot) : null;

  // Autosave so a dropped connection never loses typed work.
  const keep = (next: Partial<Draft> = {}) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload: Draft = {
        who: picked?.name ?? who,
        note,
        reason,
        iso: day?.iso ?? "",
        slot,
        ...next,
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch {
        // A browser that will not keep a draft still lets them finish in one go.
      }
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }, 600);
  };

  const look = (text: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setMatches([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients/lookup?q=${encodeURIComponent(text.trim())}`);
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { matches: PatientMatch[] };
        setMatches(body.matches);
      } catch {
        setMatches([]);
      }
    }, DEBOUNCE_MS);
  };

  const book = async (thenAnother: boolean) => {
    setTried(true);
    const digits = phone.replace(/\D/g, "");
    if (!picked) {
      toast.error("Tell us who this visit is for — a name is enough to start.");
      return;
    }
    if (isNew && digits.length < 10) {
      toast.error("That number looks short — we need 10 digits to send reminders.");
      return;
    }
    if (!chosen) {
      toast.error("Pick one of the free times first.");
      return;
    }

    const time = slot!;

    setSaving(true);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: picked.name,
          phone: isNew ? phone : picked.phone,
          appointmentDate: day.iso,
          appointmentTime: time,
          treatment: reason,
          status: "Pending",
          notes: note || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "That didn't save.");

      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clean up.
      }

      const firstName = picked.name.split(" ")[0] || picked.name;
      toast.success(`${firstName} is booked for ${day.label} at ${chosen}.`, { duration: UNDO_MS });

      if (thenAnother) {
        setWho("");
        setPicked(null);
        setIsNew(false);
        setPhone("");
        setNote("");
        setSlot(null);
        setTried(false);
        router.refresh();
      } else if (body.intakeRequired) {
        // A first visit: take their details while they are still in front of you.
        const query = new URLSearchParams({ name: picked.name, phone: isNew ? phone : picked.phone });
        router.push(`/dashboard/patient-intake?${query.toString()}`);
      } else if (body.patientId) {
        // Somebody already on the list: their file is what you want next.
        router.push(`/dashboard/patients/${body.patientId}`);
      } else {
        router.push("/dashboard/appointments");
      }
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? `${error.message} Nothing was lost — try again.`
          : "That didn't save — your connection dropped. Nothing was lost; try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid items-start gap-5">
      <div className="flex min-w-0 flex-col gap-5">
        {draftOffered && draft && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warning-border bg-warning-bg px-4 py-3"
          >
            <span className="text-[13px] text-warning">
              You had a half-finished booking for {draft.who}. Want it back?
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setWho(draft.who);
                  setNote(draft.note);
                  setReason(draft.reason);
                  setSlot(draft.slot);
                  const found = days.findIndex((item) => item.iso === draft.iso);
                  if (found >= 0) setDayIndex(found);
                  setDraftOffered(false);
                  look(draft.who);
                }}
                className="min-h-11 cursor-pointer rounded-control border border-warning bg-card px-3.5 text-[13px] font-semibold text-warning"
              >
                Restore it
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(DRAFT_KEY);
                  } catch {
                    // Nothing to clean up.
                  }
                  setDraftOffered(false);
                }}
                className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading"
              >
                Start fresh
              </button>
            </span>
          </div>
        )}

        {/* --- Who ---------------------------------------------------------- */}
        <section className={`${card} flex flex-col gap-3 px-4.5 pt-4 pb-4.5`}>
          <h2 className="text-base font-semibold text-heading">Who is coming in?</h2>

          {!picked ? (
            <>
              <div>
                <label htmlFor="who" className="mb-1.5 block text-xs font-semibold text-heading">
                  Name or phone number
                </label>
                <span className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden />
                  <input
                    id="who"
                    value={who}
                    onChange={(event) => {
                      setWho(event.target.value);
                      look(event.target.value);
                      keep({ who: event.target.value });
                    }}
                    placeholder="Start typing — e.g. Meera, or 99870"
                    autoComplete="off"
                    aria-invalid={tried && !picked}
                    className={`min-h-[46px] w-full rounded-control border bg-white pr-3 pl-9 text-[15px] text-foreground ${
                      tried && !picked ? "border-danger-mark" : "border-border-strong"
                    }`}
                  />
                </span>
                {tried && !picked && (
                  <p role="alert" className="mt-1.5 text-xs text-danger">
                    Tell us who this visit is for — a name is enough to start.
                  </p>
                )}
              </div>

              {who.trim().length >= 2 && (
                <div className="overflow-hidden rounded-control border border-border">
                  {matches.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => {
                        setPicked(match);
                        setWho(match.name);
                        setIsNew(false);
                        keep({ who: match.name });
                      }}
                      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 border-b border-border/70 bg-card px-3.5 py-2.5 text-left last:border-b-0 hover:bg-muted"
                    >
                      <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-pill bg-secondary text-xs font-bold text-heading">
                        {initialsOf(match.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-heading">{match.name}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {match.phone} · {match.detail}
                        </span>
                      </span>
                      <span className="flex-none text-xs font-semibold text-primary">Pick</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPicked({ id: 0, name: who.trim(), phone: "", detail: "New patient", alert: "" });
                      setIsNew(true);
                    }}
                    className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-t border-border bg-background px-3.5 py-2.5 text-left hover:bg-muted"
                  >
                    <Plus className="h-4 w-4 text-primary" aria-hidden />
                    <span className="text-[13px] font-semibold text-heading">
                      Add &ldquo;{who.trim()}&rdquo; as a new patient
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-control border border-border-strong px-3.5 py-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-pill bg-secondary text-[13px] font-bold text-heading">
                  {initialsOf(picked.name)}
                </span>
                <span className="min-w-0 flex-[1_1_200px]">
                  <span className="block text-[15px] font-semibold text-heading">{picked.name}</span>
                  <span className="block text-xs text-text-muted">
                    {picked.phone
                      ? `${picked.phone} · ${picked.detail}`
                      : "New patient — we will create their file when you book"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(null);
                    setIsNew(false);
                  }}
                  className="min-h-11 flex-none cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
                >
                  Change
                </button>
              </div>

              {picked.alert && (
                <p className="rounded-[0.4rem] border-l-[3px] border-l-warning bg-warning-bg px-3 py-2.5 text-[13px] text-warning">
                  {picked.alert}
                </p>
              )}

              {isNew && (
                <label className="flex max-w-xs flex-col gap-1.5">
                  <span className="text-xs font-semibold text-heading">Mobile number</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+91 98XXX XXXXX"
                    inputMode="tel"
                    aria-invalid={tried && isNew && phone.replace(/\D/g, "").length < 10}
                    className={`min-h-[46px] rounded-control border bg-white px-3 text-[15px] tabular-nums text-foreground ${
                      tried && isNew && phone.replace(/\D/g, "").length < 10
                        ? "border-danger-mark"
                        : "border-border-strong"
                    }`}
                  />
                  {tried && isNew && phone.replace(/\D/g, "").length < 10 && (
                    <span role="alert" className="text-xs text-danger">
                      That number looks short — we need 10 digits to send reminders.
                    </span>
                  )}
                </label>
              )}
            </>
          )}
        </section>

        {/* --- When --------------------------------------------------------- */}
        <section className={`${card} flex flex-col gap-3.5 px-4.5 pt-4 pb-4.5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-heading">When?</h2>
            <span className="text-xs text-text-muted">
              Free times come from this clinic&rsquo;s own slot setup
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((item, index) => (
              <button
                key={item.iso}
                type="button"
                onClick={() => {
                  setDayIndex(index);
                  setSlot(null);
                  keep({ iso: item.iso, slot: null });
                }}
                aria-pressed={index === dayIndex}
                className={`min-h-[68px] min-w-[92px] flex-none px-2.5 py-2 text-left ${chip(index === dayIndex)}`}
              >
                <span className="block text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                  {item.dow}
                </span>
                <span className="block text-[15px] font-semibold tabular-nums">{item.date}</span>
                <span
                  className={`block text-[11px] ${item.slots.length ? "text-success" : "text-warning"}`}
                >
                  {item.slots.length ? `${item.slots.length} free` : "nothing set up"}
                </span>
              </button>
            ))}
          </div>

          {day.slots.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-heading">Free times on {day.label}</p>
              <div className="flex flex-wrap gap-2">
                {day.slots.map((time, index) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => {
                      setSlot(time);
                      keep({ slot: time });
                    }}
                    aria-pressed={slot === time}
                    className={`flex min-h-[52px] flex-col items-start gap-px px-3.5 py-1.5 ${chip(slot === time)}`}
                  >
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                      {pretty(time)}
                    </span>
                    {chairs.length > 0 && (
                      <span className="text-[11px] whitespace-nowrap text-text-muted">
                        {chairs[index % chairs.length]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-[0.4rem] border-l-[3px] border-l-warning bg-warning-bg px-3.5 py-3 text-[13px] text-warning">
              Nothing is set up for {day.label} yet. Pick another day, or book a time manually — it will
              still save.
            </p>
          )}

        </section>

        {/* --- Which kind of visit ------------------------------------------ */}
        <section className={`${card} flex flex-col gap-3.5 px-4.5 pt-4 pb-4.5`}>
          <div>
            <h2 className="text-base font-semibold text-heading">What kind of visit?</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              This decides where you land after saving — a new patient needs their details taken,
              somebody you already treat does not.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {VISIT_TYPES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setReason(item.value);
                  keep({ reason: item.value });
                }}
                aria-pressed={reason === item.value}
                className={`flex min-h-[58px] flex-col items-start justify-center px-4 text-left ${chip(reason === item.value)}`}
              >
                <span className="text-sm font-semibold">{item.value}</span>
                <span className="text-xs font-normal text-text-muted">{item.note}</span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">
              Anything the clinical team should know
            </span>
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                keep({ note: event.target.value });
              }}
              rows={3}
              placeholder="Optional — e.g. she is in pain, keep 30 minutes"
              className="resize-y rounded-control border border-border bg-white px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={remind}
              onChange={(event) => setRemind(event.target.checked)}
              className="h-[18px] w-[18px] accent-primary"
            />
            <span>Send a WhatsApp reminder the evening before</span>
          </label>
        </section>
      </div>

      {/* --- Summary -------------------------------------------------------- */}
      <aside className="flex flex-col gap-5">
        <div className={`${card} flex flex-col gap-3 px-4.5 py-4`}>
          <h2 className="text-[15px] font-semibold text-heading">This booking</h2>
          <dl className="flex flex-col gap-2.5 text-[13px]">
            {[
              {
                label: "Patient",
                value: picked?.name ?? "Nobody picked yet",
                muted: !picked,
              },
              {
                label: "When",
                value: chosen ? `${day.label} at ${chosen}` : `${day.label} · no time picked`,
                muted: !chosen,
              },
              { label: "Reason", value: reason, muted: false },
              {
                label: "Reminder",
                value: remind ? "WhatsApp, evening before" : "No reminder",
                muted: false,
              },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
                  {row.label}
                </dt>
                <dd className={`tabular-nums ${row.muted ? "text-warning" : "text-foreground"}`}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            disabled={saving}
            onClick={() => void book(false)}
            className="min-h-12 cursor-pointer rounded-control border border-primary bg-primary text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
          >
            {saving ? "Booking…" : "Book it"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void book(true)}
            className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card text-[13px] font-semibold text-heading hover:bg-muted disabled:opacity-70"
          >
            Book and add another
          </button>
          <p className="text-xs text-text-muted">
            {savedAt ? `Draft saved at ${savedAt} — safe if you close this` : "We save your draft as you type"}
          </p>
        </div>

        <div className="rounded-card border border-border bg-card px-4 py-3.5">
          <p className="mb-1.5 text-xs font-semibold text-heading">{day.label} at a glance</p>
          <p className="text-[13px] text-text-muted">{day.glance}</p>
        </div>
      </aside>
    </div>
  );
}
