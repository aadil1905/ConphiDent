import { prisma } from "@/lib/prisma";
import {
  appointmentDateFromKey,
  appointmentDayRange,
  clinicNow,
  InvalidScheduleInputError,
  parseAppointmentTime,
  parseClinicDate,
  scheduleWindowSlots,
  schedulingResourcesConflict,
} from "@/lib/scheduling-core";

export function clinicDate(value: string) {
  return appointmentDateFromKey(value);
}

export type LocationAvailabilityStatus =
  | "AVAILABLE"
  | "CLOSED"
  | "FULL"
  | "PAST"
  | "MISCONFIGURED";

export type LocationAvailability = {
  status: LocationAvailabilityStatus;
  slots: string[];
  timezone: string;
};

export type LocationAvailabilityOptions = {
  providerId?: number | null;
  chairId?: number | null;
  serviceId?: number | null;
  /** Ignore the appointment being edited so PATCH does not conflict with itself. */
  excludeAppointmentId?: number;
  /** Inspect one exact slot while retaining the same closed/full/past statuses. */
  desiredTime?: string;
  now?: Date;
};

export type LocationAvailabilityReader = Pick<
  typeof prisma,
  "clinicLocation" | "clinicChair" | "clinicLocationHours" | "appointment"
>;

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function optionalIdIsValid(value: number | null | undefined) {
  return value == null || isPositiveInteger(value);
}

/** Branch-scoped availability with explicit closed/full/past failure states. */
export async function inspectLocationAvailability(
  clinicId: number,
  locationId: number,
  date: string,
  options?: LocationAvailabilityOptions,
  db: LocationAvailabilityReader = prisma,
): Promise<LocationAvailability> {
  const parsedDate = parseClinicDate(date);
  if (
    !isPositiveInteger(clinicId)
    || !isPositiveInteger(locationId)
    || !optionalIdIsValid(options?.providerId)
    || !optionalIdIsValid(options?.chairId)
    || !optionalIdIsValid(options?.serviceId)
    || !optionalIdIsValid(options?.excludeAppointmentId)
  ) {
    throw new InvalidScheduleInputError("Scheduling resource identifiers are invalid.");
  }
  if (options?.desiredTime != null) parseAppointmentTime(options.desiredTime);

  const [location, chair] = await Promise.all([
    db.clinicLocation.findFirst({
      where: {
        id: locationId,
        clinicId,
        active: true,
        ...(options?.providerId ? {
          providers: {
            some: {
              providerId: options.providerId,
              provider: { clinicId, active: true },
            },
          },
        } : {}),
        ...(options?.serviceId ? {
          services: {
            some: {
              serviceId: options.serviceId,
              service: { clinicId, active: true },
            },
          },
        } : {}),
      },
      select: { id: true, timezone: true, clinic: { select: { timezone: true } } },
    }),
    options?.chairId
      ? db.clinicChair.findFirst({
          where: { id: options.chairId, clinicId, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const timezone = location?.timezone || location?.clinic.timezone || "Asia/Kolkata";
  if (!location || (options?.chairId && !chair)) {
    return { status: "CLOSED", slots: [], timezone };
  }

  let current: ReturnType<typeof clinicNow>;
  try {
    current = clinicNow(timezone, options?.now);
  } catch (error) {
    if (error instanceof InvalidScheduleInputError) {
      return { status: "MISCONFIGURED", slots: [], timezone };
    }
    throw error;
  }
  if (date < current.date) return { status: "PAST", slots: [], timezone };

  const [hours, appointments] = await Promise.all([
    db.clinicLocationHours.findMany({
      where: { locationId, dayOfWeek: parsedDate.dayOfWeek },
      orderBy: { sortOrder: "asc" },
    }),
    db.appointment.findMany({
      where: {
        clinicId,
        ...(options?.excludeAppointmentId
          ? { id: { not: options.excludeAppointmentId } }
          : {}),
        appointmentDate: appointmentDayRange(date),
        archivedAt: null,
        status: { notIn: ["Cancelled", "No-show"] },
      },
      select: {
        appointmentTime: true,
        locationId: true,
        providerId: true,
        chairId: true,
      },
    }),
  ]);

  if (!hours.length) {
    return { status: "MISCONFIGURED", slots: [], timezone };
  }
  if (hours.every((hour) => hour.isClosed)) {
    return { status: "CLOSED", slots: [], timezone };
  }
  if (hours.some((hour) => hour.isClosed) && hours.some((hour) => !hour.isClosed)) {
    return { status: "MISCONFIGURED", slots: [], timezone };
  }

  let scheduledSlots: string[];
  try {
    scheduledSlots = scheduleWindowSlots(hours.filter((hour) => !hour.isClosed));
  } catch (error) {
    if (error instanceof InvalidScheduleInputError) {
      return { status: "MISCONFIGURED", slots: [], timezone };
    }
    throw error;
  }
  if (!scheduledSlots.length) {
    return { status: "MISCONFIGURED", slots: [], timezone };
  }

  if (options?.desiredTime != null && !scheduledSlots.includes(options.desiredTime)) {
    return { status: "CLOSED", slots: [], timezone };
  }

  const candidateSlots = options?.desiredTime != null
    ? [options.desiredTime]
    : scheduledSlots;

  const futureSlots = date === current.date
    ? candidateSlots.filter((slot) => slot > current.time)
    : candidateSlots;
  if (!futureSlots.length) {
    return {
      status: date === current.date ? "PAST" : "CLOSED",
      slots: [],
      timezone,
    };
  }

  const requestedResources = {
    locationId,
    providerId: options?.providerId,
    chairId: options?.chairId,
  };
  const occupied = new Set(appointments.filter((appointment) => (
    schedulingResourcesConflict(requestedResources, appointment)
  )).map((appointment) => appointment.appointmentTime));
  const slots = futureSlots.filter((slot) => !occupied.has(slot));

  return {
    status: slots.length ? "AVAILABLE" : "FULL",
    slots,
    timezone,
  };
}

export async function availableLocationSlots(
  clinicId: number,
  locationId: number,
  date: string,
  options?: LocationAvailabilityOptions,
  db: LocationAvailabilityReader = prisma,
) {
  return (await inspectLocationAvailability(clinicId, locationId, date, options, db)).slots;
}

/** Legacy callers resolve the active primary branch rather than falling back across tenants. */
export async function availableClinicSlots(clinicId: number, date: string) {
  const location = await prisma.clinicLocation.findFirst({
    where: { clinicId, active: true, isPrimary: true },
    select: { id: true },
  });
  return location ? availableLocationSlots(clinicId, location.id, date) : [];
}
