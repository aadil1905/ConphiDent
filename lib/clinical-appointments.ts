import "server-only";

import { prisma } from "@/lib/prisma";

export function localDate(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(`${value.slice(0, 10)}T00:00:00.000+05:30`);
}

function localDayRange(value: string | Date) {
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  return {
    start: new Date(`${key}T00:00:00.000+05:30`),
    end: new Date(`${key}T23:59:59.999+05:30`),
  };
}

/** Seen first, then confirmed, then whatever else is on the books that day. */
function visitRank(status: string) {
  if (status === "Completed") return 0;
  if (status === "Confirmed") return 1;
  return 2;
}

/**
 * The visit a piece of clinical work belongs to. Nothing is gated on
 * appointment status: whatever is on the books for that day is the visit, and
 * when the day is empty the work still saves — it just stands on its own
 * encounter instead of hanging off an appointment.
 */
export async function findVisitForDate(clinicId: number, patientId: number, value: string | Date) {
  const range = localDayRange(value);
  const visits = await prisma.appointment.findMany({
    where: {
      clinicId,
      patientId,
      archivedAt: null,
      status: { not: "Cancelled" },
      appointmentDate: { gte: range.start, lte: range.end },
    },
    orderBy: { appointmentTime: "asc" },
  });
  if (visits.length === 0) return null;
  return visits.slice().sort((a, b) => visitRank(a.status) - visitRank(b.status))[0];
}
