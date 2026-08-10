import { prisma } from "@/lib/prisma";

export function clinicDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeAt(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Branch-scoped availability. A branch must belong to the clinic and still be
 * active; its multiple hour rows deliberately represent split shifts.
 */
export async function availableLocationSlots(clinicId: number, locationId: number, date: string, options?: { providerId?: number | null; serviceId?: number | null }) {
  const appointmentDate = clinicDate(date);
  const dayOfWeek = appointmentDate.getDay();
  const [location, hours, appointments] = await Promise.all([
    prisma.clinicLocation.findFirst({
      where: { id: locationId, clinicId, active: true, ...(options?.providerId ? { providers: { some: { providerId: options.providerId } } } : {}), ...(options?.serviceId ? { services: { some: { serviceId: options.serviceId } } } : {}) },
      select: { id: true },
    }),
    prisma.clinicLocationHours.findMany({ where: { locationId, dayOfWeek }, orderBy: { sortOrder: "asc" } }),
    prisma.appointment.findMany({
      where: { clinicId, locationId, appointmentDate, archivedAt: null, status: { notIn: ["Cancelled", "No-show"] } },
      select: { appointmentTime: true },
    }),
  ]);
  if (!location || !hours.length || hours.every((hour) => hour.isClosed)) return [];
  const occupied = new Set(appointments.map((appointment) => appointment.appointmentTime));
  return Array.from(new Set(hours.flatMap((hour) => {
    if (hour.isClosed) return [];
    const slots: string[] = [];
    const slotMinutes = Math.max(15, hour.slotMinutes);
    for (let current = minutes(hour.openTime); current + slotMinutes <= minutes(hour.closeTime); current += slotMinutes) {
      const slot = timeAt(current);
      if (!occupied.has(slot)) slots.push(slot);
    }
    return slots;
  }))).sort();
}

/** Legacy callers resolve the active primary branch rather than falling back across tenants. */
export async function availableClinicSlots(clinicId: number, date: string) {
  const location = await prisma.clinicLocation.findFirst({ where: { clinicId, active: true, isPrimary: true }, select: { id: true } });
  return location ? availableLocationSlots(clinicId, location.id, date) : [];
}
