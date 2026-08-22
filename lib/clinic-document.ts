import { prisma } from "@/lib/prisma";

/**
 * The letterhead contract, shared by every printed sheet.
 *
 * The brand columns used to be re-listed by hand in each print route, which is
 * how the prescription sheet ended up without `invoiceFooter` while the bill
 * had it. One select, one type.
 */
export const clinicDocumentSelect = {
  name: true,
  brandName: true,
  logoUrl: true,
  accentColor: true,
  letterheadPrefix: true,
  letterheadName: true,
  tagline: true,
  principalName: true,
  principalCredentials: true,
  address: true,
  phone: true,
  email: true,
  gstin: true,
  registrationNumber: true,
  invoiceFooter: true,
  paymentDetails: true,
} as const;

export type ClinicDocumentBrand = {
  name: string;
  brandName?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  letterheadPrefix?: string | null;
  letterheadName?: string | null;
  tagline?: string | null;
  principalName?: string | null;
  principalCredentials?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  registrationNumber?: string | null;
  hoursLine?: string | null;
};

export type ClinicOpeningHour = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A clinic week reads Monday-first; the schema stores Sunday as 0. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "17:30" -> "5.30 PM", the way the pads are set. */
function clockLabel(value: string) {
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}.${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * "Mon–Fri 10.00 AM–1.30 PM & 5.30 PM–8.30 PM · Sat 10.00 AM–4.00 PM · Sun closed".
 *
 * Days that keep identical hours collapse into a range, because a letterhead
 * that lists seven days separately stops being a letterhead. Split sessions
 * (a morning and an evening sitting) arrive as two rows for the same day —
 * only `ClinicLocationHours` can express them, which is why a clinic's own
 * location hours are the better source when it has them.
 */
export function formatClinicHours(hours: ClinicOpeningHour[]) {
  if (!hours.length) return null;

  const byDay = new Map<number, string>();
  for (const day of WEEK_ORDER) {
    const sessions = hours.filter((entry) => entry.dayOfWeek === day);
    if (!sessions.length) continue;
    const open = sessions.filter((entry) => !entry.isClosed);
    byDay.set(day, open.length ? open.map((entry) => `${clockLabel(entry.openTime)}–${clockLabel(entry.closeTime)}`).join(" & ") : "closed");
  }
  if (!byDay.size) return null;

  const days = WEEK_ORDER.filter((day) => byDay.has(day));
  const groups: string[] = [];
  let runStart = 0;
  for (let index = 0; index <= days.length; index += 1) {
    const sameAsRun = index < days.length && byDay.get(days[index]) === byDay.get(days[runStart]);
    if (sameAsRun) continue;
    const from = DAY_LABELS[days[runStart]];
    const to = DAY_LABELS[days[index - 1]];
    const label = index - 1 === runStart ? from : `${from}–${to}`;
    groups.push(`${label} ${byDay.get(days[runStart])}`);
    runStart = index;
  }
  return groups.join(" · ");
}

/** The big line of the masthead, and the small possessive that sits above it. */
export function letterheadLines(clinic: ClinicDocumentBrand) {
  const fallback = clinic.brandName?.trim() || clinic.name;
  return {
    prefix: clinic.letterheadPrefix?.trim() || null,
    name: clinic.letterheadName?.trim() || fallback,
    tagline: clinic.tagline?.trim() || null,
  };
}

/** The display name used off the letterhead — footers, alt text, page titles. */
export function clinicDocumentName(clinic: ClinicDocumentBrand) {
  return clinic.brandName?.trim() || clinic.name;
}

/**
 * Everything the letterhead needs, in one read.
 *
 * Opening hours come from the clinic's primary location when it has one:
 * `ClinicLocationHours` is the only table that can hold two sittings on the
 * same day, and a dental practice that closes over lunch cannot be described
 * without that. `ClinicHours` is the fallback for a clinic with no locations
 * configured.
 */
export async function loadClinicDocumentBrand(clinicId: number): Promise<ClinicDocumentBrand | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      ...clinicDocumentSelect,
      hours: { select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true } },
      locations: {
        where: { active: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        take: 1,
        select: { hours: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }], select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true } } },
      },
    },
  });
  if (!clinic) return null;

  const { hours, locations, ...brand } = clinic;
  const locationHours = locations[0]?.hours ?? [];
  return { ...brand, hoursLine: formatClinicHours(locationHours.length ? locationHours : hours) };
}
