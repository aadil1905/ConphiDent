/**
 * The rules for reading a tooth's history across the two tables that hold it.
 *
 * `DentalChartEntry` is described elsewhere in the code as a legacy mirror of
 * `DentalFinding`. Measured against the live clinic on 2026-08-17 it is not a
 * mirror, it is the superset: 38 chart rows against 9 findings, and 29 of the
 * chart rows have no finding at all — crowns, root canals and fillings that
 * exist nowhere else. A reader that queries findings alone reports a tooth as
 * never touched while the chart beside it draws a crown on it.
 *
 * So every reader has to ask both tables, and the rules for combining them are
 * fiddly enough to be worth having in one place rather than copied per screen:
 *
 * - Legacy rows are usually orphaned from their encounter (`encounterId` is
 *   nullable and mostly null), so they are matched on patient plus visit day,
 *   never on the encounter.
 * - "Same day" means the same day *in the clinic's timezone*. A 9pm IST visit
 *   is already the next day in UTC, so a naive UTC comparison splits one visit
 *   in two and reports the same tooth twice.
 * - Because a legacy row can only be placed by patient and day, two notes
 *   written on one visit both show that visit's whole tooth list rather than
 *   the teeth belonging to each. That is the most the data supports, not a
 *   defect: nothing in a legacy row says which note it went with. The backfill
 *   is what would make it finer.
 * - A legacy row carries a condition but no `recordType` and no surfaces, so it
 *   cannot say whether the tooth was found like this or treated like this. The
 *   chart itself reads those same conditions as one or the other and
 *   `TREATED_CONDITIONS` follows it. That inference is exactly what the pending
 *   backfill needs the dentist to agree, so nothing here writes it down.
 *
 * This module is pure so it can be tested without a database; the queries that
 * feed it live in `lib/dental-chart.ts`.
 */

const CLINIC_TIME_ZONE = "Asia/Kolkata";

/**
 * Conditions the chart draws as work that was done rather than work that was
 * found. Kept in step with the `conditions` list in the clinical workspace.
 */
export const TREATED_CONDITIONS = new Set(["FILLING", "CROWN", "ROOT_CANAL", "IMPLANT", "MISSING"]);

export type ChartedFinding = { toothCodeSnapshot: string; at: Date };
export type LegacyChartEntry = { id: number; toothNumber: string; condition: string; visitDate: Date };

/** The calendar day a timestamp falls on in the clinic's timezone. */
export function clinicDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/**
 * A UTC window wide enough to contain the clinic day `value` falls on.
 *
 * The offset is +05:30 today, but querying a window and narrowing it with
 * `clinicDateKey` means the read stays correct whatever the offset is, and
 * still uses the `[patientId, visitDate]` index.
 */
export function clinicDayWindow(value: Date) {
  const day = 24 * 60 * 60 * 1000;
  return { gte: new Date(value.getTime() - day), lt: new Date(value.getTime() + day) };
}

/** FDI codes are numeric within a quadrant, so a numeric collation reads right. */
function byToothCode(left: string, right: string) {
  return left.localeCompare(right, "en", { numeric: true });
}

/**
 * Every tooth charted on one visit, from both tables, de-duplicated.
 *
 * `legacyEntries` may span more than the visit day — the caller queries a
 * window — so they are narrowed here to the day the visit actually fell on.
 */
export function mergeChartedTeeth(
  findings: { toothCodeSnapshot: string }[],
  legacyEntries: { toothNumber: string; visitDate: Date }[],
  visitDate: Date,
): string[] {
  const visitKey = clinicDateKey(visitDate);
  const teeth = new Set(findings.map((finding) => finding.toothCodeSnapshot));
  for (const entry of legacyEntries) {
    if (clinicDateKey(entry.visitDate) === visitKey) teeth.add(entry.toothNumber);
  }
  return [...teeth].sort(byToothCode);
}

/**
 * The same merge for a whole page of visits at once.
 *
 * A list draws thirty rows, so asking per row would be thirty round trips. The
 * caller makes one legacy query across every patient on the page and hands the
 * rows here to be sorted into the visit each belongs to.
 */
export function mergeChartedTeethByVisit<Key>(
  visits: { key: Key; patientId: number; visitDate: Date; findings: { toothCodeSnapshot: string }[] }[],
  legacyEntries: { patientId: number; toothNumber: string; visitDate: Date }[],
): Map<Key, string[]> {
  const byPatientDay = new Map<string, string[]>();
  for (const entry of legacyEntries) {
    const dayKey = `${entry.patientId}@${clinicDateKey(entry.visitDate)}`;
    const teeth = byPatientDay.get(dayKey);
    if (teeth) teeth.push(entry.toothNumber);
    else byPatientDay.set(dayKey, [entry.toothNumber]);
  }
  return new Map(visits.map((visit) => {
    const dayKey = `${visit.patientId}@${clinicDateKey(visit.visitDate)}`;
    const teeth = new Set(visit.findings.map((finding) => finding.toothCodeSnapshot));
    for (const tooth of byPatientDay.get(dayKey) ?? []) teeth.add(tooth);
    return [visit.key, [...teeth].sort(byToothCode)] as const;
  }));
}

/**
 * Treatment recorded only in the legacy chart, newest first.
 *
 * A legacy row is dropped when a finding already covers the same tooth on the
 * same clinic day, so a tooth charted since the newer table arrived is not
 * reported twice.
 */
export function legacyProceduresNotInFindings(
  legacyEntries: LegacyChartEntry[],
  findings: ChartedFinding[],
): LegacyChartEntry[] {
  const covered = new Set(findings.map((finding) => `${finding.toothCodeSnapshot}@${clinicDateKey(finding.at)}`));
  return legacyEntries
    .filter((entry) => TREATED_CONDITIONS.has(entry.condition))
    .filter((entry) => !covered.has(`${entry.toothNumber}@${clinicDateKey(entry.visitDate)}`))
    .sort((left, right) => right.visitDate.getTime() - left.visitDate.getTime());
}
