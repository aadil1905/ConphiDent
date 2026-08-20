/**
 * Reads across the two tables that hold a tooth's history.
 *
 * The rules for combining them, and why there are two, are in
 * `lib/dental-chart-core.ts`. This file only supplies the queries.
 */

import { prisma } from "@/lib/prisma";
import { clinicDayWindow, mergeChartedTeeth, mergeChartedTeethByVisit } from "@/lib/dental-chart-core";

export { TREATED_CONDITIONS, clinicDateKey, legacyProceduresNotInFindings } from "@/lib/dental-chart-core";
export type { ChartedFinding, LegacyChartEntry } from "@/lib/dental-chart-core";

/**
 * Every tooth charted on one visit, from both tables.
 *
 * Findings are taken from the encounter when the visit has one; legacy rows are
 * matched on patient and clinic day, because most of them carry no encounter.
 */
export async function chartedTeethForVisit(input: {
  clinicId: number;
  patientId: number;
  visitDate: Date;
  encounterId: number | null;
}): Promise<string[]> {
  const [findings, legacyEntries] = await Promise.all([
    input.encounterId
      ? prisma.dentalFinding.findMany({
          where: { clinicId: input.clinicId, encounterId: input.encounterId, status: "ACTIVE" },
          select: { toothCodeSnapshot: true },
        })
      : Promise.resolve([]),
    prisma.dentalChartEntry.findMany({
      where: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        status: "CURRENT",
        visitDate: clinicDayWindow(input.visitDate),
      },
      select: { toothNumber: true, visitDate: true },
    }),
  ]);
  return mergeChartedTeeth(findings, legacyEntries, input.visitDate);
}

/**
 * The teeth on each of a page of visits, in one extra query rather than one per
 * row. Returns a map keyed by whatever `key` the caller supplied.
 */
export async function chartedTeethForVisits<Key>(
  clinicId: number,
  visits: { key: Key; patientId: number; visitDate: Date; findings: { toothCodeSnapshot: string }[] }[],
): Promise<Map<Key, string[]>> {
  if (!visits.length) return new Map();
  const days = visits.map((visit) => visit.visitDate.getTime());
  const legacyEntries = await prisma.dentalChartEntry.findMany({
    where: {
      clinicId,
      status: "CURRENT",
      patientId: { in: [...new Set(visits.map((visit) => visit.patientId))] },
      // One window spanning the whole page; the merge narrows each row to its
      // own clinic day.
      visitDate: {
        gte: clinicDayWindow(new Date(Math.min(...days))).gte,
        lt: clinicDayWindow(new Date(Math.max(...days))).lt,
      },
    },
    select: { patientId: true, toothNumber: true, visitDate: true },
  });
  return mergeChartedTeethByVisit(visits, legacyEntries);
}
