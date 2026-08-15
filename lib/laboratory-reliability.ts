/**
 * How good a lab actually is, measured from your own cases over the last 90
 * days rather than from what the lab promises. "On time" means the work came
 * back on or before the day the patient was promised it — read from the case
 * event that recorded it arriving, not from a field anyone can edit later.
 */

import { prisma } from "@/lib/prisma";
import { LAB_BACK_STATUSES } from "@/lib/laboratory-core";

const WINDOW_DAYS = 90;

export type LabReliability = {
  labId: number;
  /** Cases sent in the window, whatever happened to them. */
  cases: number;
  /** Of the ones that came back, how many made the promised day. */
  onTimePercent: number | null;
  cameBack: number;
  /** Days from sending to it arriving, averaged. */
  usualWaitDays: number | null;
  verdict: "reliable" | "watch" | "late" | "too-new";
};

export function verdictLabel(verdict: LabReliability["verdict"]) {
  if (verdict === "reliable") return "Reliable";
  if (verdict === "watch") return "Slips sometimes — allow a spare day";
  if (verdict === "late") return "Often late — allow extra days";
  return "Not enough cases yet to judge";
}

export async function labReliability(clinicId: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const cases = await prisma.labCase.findMany({
    where: { clinicId, createdAt: { gte: since }, labId: { not: null } },
    select: {
      labId: true,
      dueDate: true,
      createdAt: true,
      events: {
        where: { toStatus: { in: [...LAB_BACK_STATUSES] } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const running = new Map<number, { cases: number; cameBack: number; onTime: number; waitDays: number[] }>();

  for (const item of cases) {
    if (!item.labId) continue;
    const tally = running.get(item.labId) ?? { cases: 0, cameBack: 0, onTime: 0, waitDays: [] };
    tally.cases += 1;

    const arrived = item.events[0]?.createdAt;
    if (arrived) {
      tally.cameBack += 1;
      tally.waitDays.push(Math.max(0, Math.round((arrived.getTime() - item.createdAt.getTime()) / 86_400_000)));
      // No promised day means nothing to be late against.
      if (!item.dueDate || arrived <= item.dueDate) tally.onTime += 1;
    }
    running.set(item.labId, tally);
  }

  const byLab = new Map<number, LabReliability>();
  for (const [labId, tally] of running) {
    const onTimePercent = tally.cameBack ? Math.round((tally.onTime / tally.cameBack) * 100) : null;
    const usualWaitDays = tally.waitDays.length
      ? Math.round(tally.waitDays.reduce((sum, days) => sum + days, 0) / tally.waitDays.length)
      : null;

    byLab.set(labId, {
      labId,
      cases: tally.cases,
      cameBack: tally.cameBack,
      onTimePercent,
      usualWaitDays,
      // Under five returned cases a percentage says more about luck than the lab.
      verdict:
        tally.cameBack < 5 || onTimePercent === null
          ? "too-new"
          : onTimePercent >= 90
            ? "reliable"
            : onTimePercent >= 75
              ? "watch"
              : "late",
    });
  }

  return byLab;
}
