/**
 * The one contract for keeping a half-typed form on the device.
 *
 * This exists because the app was already doing it, badly. Two forms wrote
 * drafts to `localStorage` under global keys — `conphident.booking.draft` and
 * `conphident.add-patient.draft` — with no clinic, no user and no patient in
 * the key, no expiry, and nothing clearing them at sign-out. On a shared
 * operatory machine that meant the next person to open "Add a patient" was
 * shown the previous patient's name, phone, age and urgent medical flag,
 * already filled in, with no prompt.
 *
 * Three rules, and they are the whole module:
 *
 *  1. **Nothing clinical goes in.** Free-text notes, reasons and medical flags
 *     are special-category data and they stay in memory. A dropped connection
 *     losing an unsaved flag is a worse day; a flag leaking to the next user of
 *     a shared tablet is a worse problem. `strip` is where that line is drawn,
 *     and it is deliberately a denylist of field names rather than a shape, so
 *     adding a field to a form cannot silently start persisting it.
 *  2. **Drafts expire.** A draft belongs to a visit and a visit ends. Anything
 *     older than the window is discarded on read, not just on a timer, so a
 *     machine that slept through the weekend still comes back clean.
 *  3. **Drafts do not survive a sign-out.** `clearAllDrafts` is called from the
 *     login screen, which is where every sign-out lands.
 *
 * What this deliberately does *not* do is persist the six clinical forms.
 * Reviewing that idea is what turned up the defect above: a clinical note
 * restored into the wrong patient's form does not lose a record, it signs a
 * false one. If clinical drafts are wanted, they belong server-side behind the
 * same permission checks as the records themselves.
 */

/** Every key this module owns. Anything else in localStorage is not a draft. */
const PREFIX = "conphident.draft.";

/** A draft belongs to one working day. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Field names that never reach the device, whatever form they come from.
 * Matched case-insensitively against the whole key, so `medicalNotes`,
 * `clinicalNotes` and `noteForPatient` are all caught by "note".
 */
const NEVER_PERSIST = [
  "note",
  "reason",
  "flag",
  "allerg",
  "diagnos",
  "complaint",
  "history",
  "medic",
  "consent",
  "treatment",
  "symptom",
];

type Stored<T> = { savedAt: number; value: T };

function strip<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (NEVER_PERSIST.some((banned) => lower.includes(banned))) continue;
    out[key] = entry;
  }
  return out as Partial<T>;
}

export function saveDraft<T extends Record<string, unknown>>(name: string, value: T) {
  try {
    const payload: Stored<Partial<T>> = { savedAt: Date.now(), value: strip(value) };
    localStorage.setItem(PREFIX + name, JSON.stringify(payload));
  } catch {
    // A browser that will not keep a draft still lets them finish in one go.
  }
}

/** Returns null for a missing, unreadable or expired draft, and clears it. */
export function readDraft<T>(name: string): { value: Partial<T>; savedAt: Date } | null {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<Partial<T>>;
    if (typeof parsed?.savedAt !== "number" || !parsed.value) {
      localStorage.removeItem(PREFIX + name);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + name);
      return null;
    }
    return { value: parsed.value, savedAt: new Date(parsed.savedAt) };
  } catch {
    return null;
  }
}

export function clearDraft(name: string) {
  try {
    localStorage.removeItem(PREFIX + name);
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Wipes every draft on the device. Called from the login screen, which is
 * where signing out lands — `logoutAction` is a server action and cannot
 * reach `localStorage` itself. Also clears the two retired global keys, so a
 * device that already holds one from before this change is cleaned on the next
 * sign-in rather than keeping it forever.
 */
export function clearAllDrafts() {
  try {
    const retired = ["conphident.booking.draft", "conphident.add-patient.draft", "conphident.patient.draft"];
    retired.forEach((key) => localStorage.removeItem(key));
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to clean up.
  }
}
