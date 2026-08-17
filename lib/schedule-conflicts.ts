import { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/prisma";
import {
  appointmentDateKey,
  appointmentDayRange,
  InvalidScheduleInputError,
  parseAppointmentTime,
} from "@/lib/scheduling-core";

type AppointmentSlot = {
  clinicId: number;
  appointmentDate: Date;
  appointmentTime: string;
  locationId?: number | null;
  providerId?: number | null;
  chairId?: number | null;
  excludeAppointmentId?: number;
};

type AppointmentReader = Pick<Db, "appointment">;

function assertOptionalId(value: number | null | undefined, label: string) {
  if (value != null && (!Number.isInteger(value) || value <= 0)) {
    throw new InvalidScheduleInputError(`${label} is invalid.`);
  }
}

/**
 * An unassigned branch appointment reserves the branch slot; otherwise named
 * providers and chairs may operate in parallel only when neither overlaps.
 */
export async function findScheduleConflict(slot: AppointmentSlot, db: AppointmentReader = prisma) {
  if (!Number.isInteger(slot.clinicId) || slot.clinicId <= 0) {
    throw new InvalidScheduleInputError("Clinic identifier is invalid.");
  }
  assertOptionalId(slot.locationId, "Branch identifier");
  assertOptionalId(slot.providerId, "Provider identifier");
  assertOptionalId(slot.chairId, "Chair identifier");
  assertOptionalId(slot.excludeAppointmentId, "Excluded appointment identifier");
  parseAppointmentTime(slot.appointmentTime);

  const conflicts: Prisma.AppointmentWhereInput[] = [];
  if (slot.providerId) conflicts.push({ providerId: slot.providerId });
  if (slot.chairId) conflicts.push({ chairId: slot.chairId });
  if (slot.locationId) {
    conflicts.push(
      slot.providerId || slot.chairId
        ? { locationId: slot.locationId, providerId: null, chairId: null }
        : { locationId: slot.locationId },
    );
  }
  if (!conflicts.length) return null;

  const dateKey = appointmentDateKey(slot.appointmentDate);
  return db.appointment.findFirst({
    where: {
      clinicId: slot.clinicId,
      archivedAt: null,
      appointmentDate: appointmentDayRange(dateKey),
      appointmentTime: slot.appointmentTime,
      status: { notIn: ["Cancelled", "No-show"] },
      ...(slot.excludeAppointmentId ? { id: { not: slot.excludeAppointmentId } } : {}),
      OR: conflicts,
    },
    include: { provider: true, chair: true },
    orderBy: { id: "asc" },
  });
}
