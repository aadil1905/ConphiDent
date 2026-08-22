"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { PatientMatch } from "@/app/api/patients/lookup/route";
import { clearDraft, readDraft, saveDraft } from "@/lib/local-draft";

// `note` and `reason` are stripped by `saveDraft` and never reach the device;
// only the scaffolding of who and when survives a reload.
const DRAFT_NAME = "booking";
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
  /** The clinic decided not to open this day — different from hours never set. */
  closed?: boolean;
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
  todayIso,
  defaultIso,
  defaultTime,
  defaultPatientName,
  defaultPhone,
  isOwner,
}: {
  days: BookableDay[];
  chairs: string[];
  /** The clinic's own today — the floor for the further-out date picker. */
  todayIso: string;
  defaultIso?: string;
  defaultTime?: string;
  defaultPatientName?: string;
  defaultPhone?: string;
  /** /dashboard/settings/operations hard-gates to OWNER; anyone else who
   *  followed the "Set up hours" link below would just get bounced home. */
  isOwner: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Moves the whole seven-day window to the chosen date — the server anchors
  // its grid on ?date=, so a recall months out books from this same screen.
  // Whoever is already picked or typed rides along in the params the page
  // reads back (?patient= / ?name= / ?phone=), so nothing is retyped.
  const jumpWindow = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", iso);
    params.delete("time");
    if (picked && !isNew && picked.id) {
      params.set("patient", String(picked.id));
      params.delete("name");
      params.delete("phone");
    } else {
      // Arriving here from ?patient=A (Patients list, Add-patient sheet,
      // Conversations) leaves `patient` sitting in searchParams even after
      // the receptionist types over it with a new name — the page reads
      // `patient` first, so the old record kept winning across a date jump.
      params.delete("patient");
      const name = (picked?.name ?? who).trim();
      if (name) params.set("name", name);
      else params.delete("name");
      if (phone.trim()) params.set("phone", phone.trim());
      else params.delete("phone");
    }
    router.push(`/dashboard/appointments/new?${params.toString()}`);
  };
  const timer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);
  // The submit button sits at the bottom of a long page while the fields it
  // validates sit at the top. A toast alone strands the user next to the
  // button; the failing field has to be brought back on screen.
  const whoRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const whenRef = useRef<HTMLElement | null>(null);

  const bringToField = (target: HTMLElement | null) => {
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
  };

  const [draft, setDraft] = useState<Draft | null>(null);
  const [who, setWho] = useState(defaultPatientName ?? "");
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [picked, setPicked] = useState<PatientMatch | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [phone, setPhone] = useState(defaultPhone ?? "");

  const startIndex = Math.max(0, days.findIndex((day) => day.iso === defaultIso));
  const [dayIndex, setDayIndex] = useState(startIndex);
  const [slot, setSlot] = useState<string | null>(defaultTime ?? null);

  const [reason, setReason] = useState<string>(VISIT_TYPES[0].value);
  const [note, setNote] = useState("");

  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [draftOffered, setDraftOffered] = useState(false);

  // The draft is read after mount, and on a scheduled tick rather than in the
  // effect body: localStorage does not exist on the server, so reading it as
  // initial state made the server and client render different HTML and React
  // reported a hydration failure on every visit to this page.
  useEffect(() => {
    const tick = setTimeout(() => {
      const saved = readDraft<Draft>(DRAFT_NAME);
      if (saved?.value.who) {
        // The clinical free text is gone by design, so what comes back is the
        // scaffolding: who it was for, and which slot was being looked at.
        setDraft({ note: "", reason: "", iso: "", slot: null, ...saved.value } as Draft);
        setDraftOffered(true);
      }
    }, 0);
    return () => clearTimeout(tick);
  }, []);

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
        saveDraft(DRAFT_NAME, payload);
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
      setLookupFailed(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients/lookup?q=${encodeURIComponent(text.trim())}`);
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { matches: PatientMatch[] };
        setMatches(body.matches);
        setLookupFailed(false);
      } catch {
        // Failing silently here used to leave "add as a new patient" as the
        // only visible row, which quietly steered a receptionist into creating
        // a duplicate record whenever the lookup was down.
        setMatches([]);
        setLookupFailed(true);
      }
    }, DEBOUNCE_MS);
  };

  const book = async (thenAnother: boolean) => {
    setTried(true);
    const digits = phone.replace(/\D/g, "");
    if (!picked) {
      toast.error("Tell us who this visit is for — a name is enough to start.");
      bringToField(whoRef.current);
      return;
    }
    if (isNew && digits.length < 10) {
      toast.error("That number looks short — we need 10 digits to send reminders.");
      bringToField(phoneRef.current);
      return;
    }
    if (!chosen) {
      toast.error("Pick one of the free times first.");
      bringToField(whenRef.current);
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
          status: "Confirmed",
          notes: note || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "That didn't save.");

      try {
        // Cancel the debounced autosave first: otherwise a timer armed by the
        // last keystroke fires after this and writes the draft straight back.
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        clearDraft(DRAFT_NAME);
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
            <span className="text-[length:var(--text-secondary)] text-warning">
              You had a half-finished booking for {draft.who}. Want it back?
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setWho(draft.who);
                  setNote(draft.note);
                  // A draft can outlive its own week and its own vocabulary.
                  // Restoring a time onto whatever day happens to be first
                  // would book a day nobody picked, so the slot only comes
                  // back when its day is still on offer and still has it.
                  setReason(
                    VISIT_TYPES.some((type) => type.value === draft.reason)
                      ? draft.reason
                      : VISIT_TYPES[0].value,
                  );
                  const found = days.findIndex((item) => item.iso === draft.iso);
                  if (found >= 0) {
                    setDayIndex(found);
                    setSlot(days[found].slots.includes(draft.slot ?? "") ? draft.slot : null);
                  } else {
                    setSlot(null);
                    toast.message("That draft's day has passed — pick a new time.");
                  }
                  setDraftOffered(false);
                  look(draft.who);
                }}
                className="min-h-11 cursor-pointer rounded-control border border-warning bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-warning"
              >
                Restore it
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    clearDraft(DRAFT_NAME);
                  } catch {
                    // Nothing to clean up.
                  }
                  setDraftOffered(false);
                }}
                className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading"
              >
                Start fresh
              </button>
            </span>
          </div>
        )}

        {/* --- Who ---------------------------------------------------------- */}
        <section className={`${card} flex flex-col gap-3 px-5.5 pt-4 pb-4.5`}>
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Who is coming in?</h2>

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
                    ref={whoRef}
                    value={who}
                    onChange={(event) => {
                      setWho(event.target.value);
                      look(event.target.value);
                      keep({ who: event.target.value });
                    }}
                    placeholder="Start typing — e.g. Meera, or 99870"
                    autoComplete="off"
                    aria-invalid={tried && !picked}
                    className={`min-h-[46px] w-full rounded-control border bg-card pr-3 pl-9 text-[length:var(--text-body)] text-foreground ${
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

              {who.trim().length >= 2 && lookupFailed && (
                <p role="alert" className="rounded-chip border-l-[3px] border-l-warning bg-warning-bg px-3 py-2.5 text-[length:var(--text-secondary)] text-warning">
                  The patient search didn&rsquo;t come back — check the connection before adding
                  them as new, or they may end up in the list twice.
                </p>
              )}

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
                    <span className="text-[length:var(--text-secondary)] font-semibold text-heading">
                      Add &ldquo;{who.trim()}&rdquo; as a new patient
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-control border border-border-strong px-3.5 py-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-pill bg-secondary text-[length:var(--text-secondary)] font-bold text-heading">
                  {initialsOf(picked.name)}
                </span>
                <span className="min-w-0 flex-[1_1_200px]">
                  <span className="block text-[length:var(--text-body)] font-semibold text-heading">{picked.name}</span>
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
                  className="min-h-11 flex-none cursor-pointer rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                >
                  Change
                </button>
              </div>

              {picked.alert && (
                <p className="rounded-chip border-l-[3px] border-l-warning bg-warning-bg px-3 py-2.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-warning">
                  {picked.alert}
                </p>
              )}

              {isNew && (
                <label className="flex max-w-xs flex-col gap-1.5">
                  <span className="text-xs font-semibold text-heading">Mobile number</span>
                  <input
                    ref={phoneRef}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+91 98XXX XXXXX"
                    inputMode="tel"
                    aria-invalid={tried && isNew && phone.replace(/\D/g, "").length < 10}
                    className={`min-h-[46px] rounded-control border bg-card px-3 text-[length:var(--text-body)] tabular-nums text-foreground ${
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
        <section ref={whenRef} className={`${card} flex flex-col gap-3.5 px-5.5 pt-4 pb-4.5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">When?</h2>
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
                <span className="block text-[length:var(--text-micro)] font-semibold tracking-[0.14em] text-text-muted uppercase">
                  {item.dow}
                </span>
                <span className="block text-[length:var(--text-body)] font-semibold tabular-nums">{item.date}</span>
                <span
                  className={`block text-[length:var(--text-micro)] ${item.slots.length ? "text-success" : item.closed ? "text-text-muted" : "text-warning"}`}
                >
                  {item.slots.length ? `${item.slots.length} free` : item.closed ? "closed" : "nothing set up"}
                </span>
              </button>
            ))}
          </div>

          {/* Recalls land months away; the strip is a window, not the limit. */}
          <label className="flex flex-wrap items-center gap-2.5 text-xs font-semibold text-text-muted">
            Further out?
            <input
              type="date"
              min={todayIso}
              defaultValue={days[0]?.iso}
              onChange={(event) => jumpWindow(event.target.value)}
              aria-label="Show the week around another date"
              className="min-h-11 cursor-pointer rounded-control border border-input bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading"
            />
            {days[0] && days[0].iso !== todayIso && (
              <button
                type="button"
                onClick={() => jumpWindow(todayIso)}
                className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
              >
                Back to this week
              </button>
            )}
          </label>

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
                    {/* No chair label here on purpose. It used to show
                        chairs[index % chairs.length] — the slot's position in
                        the list, not an actual assignment — so two different
                        times could claim the same chair and the booking
                        itself carries no chairId either way. */}
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                      {pretty(time)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 rounded-chip border-l-[3px] border-l-warning bg-warning-bg px-3.5 py-3 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-warning">
              <p className="min-w-0 flex-1">
                {day.closed
                  ? `The clinic is closed on ${day.label}. Pick another day.`
                  : /* There is no manual-time fallback anywhere in this
                       component — only `day.slots` renders a pickable time,
                       and an empty day has none. The old copy sent the
                       receptionist hunting for a control that never existed. */
                    isOwner
                    ? `No hours are set up for ${day.label} yet. Pick another day, or set them up now.`
                    : `No hours are set up for ${day.label} yet. Pick another day, or ask the clinic owner to set them up.`}
              </p>
              {!day.closed && isOwner && (
                <Link
                  href="/dashboard/settings/operations"
                  className="inline-flex min-h-11 flex-none items-center rounded-control border border-warning bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-warning hover:bg-muted"
                >
                  Set up hours
                </Link>
              )}
            </div>
          )}

        </section>

        {/* --- Which kind of visit ------------------------------------------ */}
        <section className={`${card} flex flex-col gap-3.5 px-5.5 pt-4 pb-4.5`}>
          <div>
            <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">What kind of visit?</h2>
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
              className="resize-y rounded-control border border-border bg-card px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          {/* The reminder checkbox that used to sit here promised "WhatsApp,
              evening before" — and was never sent with the booking. Nothing in
              the API schedules a reminder at booking time; reminders are sent
              from the visit with SendReminderButton. A control that does
              nothing either way is worse than no control. */}
        </section>
      </div>

      {/* --- Summary -------------------------------------------------------- */}
      <aside className="flex flex-col gap-6">
        <div className={`${card} flex flex-col gap-3 px-5.5 py-4`}>
          <h2 className="text-[length:var(--text-body)] font-semibold text-heading">This booking</h2>
          <dl className="flex flex-col gap-2.5 text-[length:var(--text-secondary)]">
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
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[length:var(--text-micro)] font-semibold tracking-[0.14em] text-text-muted uppercase">
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
            className="min-h-12 cursor-pointer rounded-control border border-primary bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-70"
          >
            {saving ? "Booking…" : "Book it"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void book(true)}
            className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted disabled:opacity-70"
          >
            Book and add another
          </button>
          <p className="text-xs text-text-muted">
            {savedAt ? `Draft saved at ${savedAt} — safe if you close this` : "We save your draft as you type"}
          </p>
        </div>

        <div className="rounded-card border border-border bg-card px-4 py-3.5">
          <p className="mb-1.5 text-xs font-semibold text-heading">{day.label} at a glance</p>
          <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{day.glance}</p>
        </div>
      </aside>
    </div>
  );
}
