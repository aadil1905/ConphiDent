
import { prisma, type Db } from "@/lib/prisma";
import {
  assertBookableClinicSlot,
  InvalidScheduleInputError,
  parseAppointmentTime,
  parseClinicDate,
  scheduleWindowSlots,
} from "@/lib/scheduling-core";

type SchedulingReader = Pick<
  Db,
  "clinicLocation" | "clinicProvider" | "clinicChair"
>;

export type ValidatedAppointmentResources = {
  locationId: number;
  providerId: number | null;
  chairId: number | null;
  timezone: string;
};

type ValidateAppointmentResourcesInput = {
  clinicId: number;
  appointmentDate: string;
  appointmentTime: string;
  treatment?: string;
  locationId?: number | null;
  providerId?: number | null;
  chairId?: number | null;
  now?: Date;
};

function optionalId(value: number | null | undefined, label: string) {
  if (value != null && (!Number.isInteger(value) || value < 1)) {
    throw new InvalidScheduleInputError(`${label} is invalid.`);
  }
}

/**
 * The times the booking screen may offer, by weekday.
 *
 * This exists because the picker used to build its own slots from the
 * clinic-level `ClinicHours` while the write validated against the branch's
 * `ClinicLocationHours`. When the two disagreed — a different opening time or
 * slot length — the screen offered a time the server then refused, and the only
 * way to book was to guess. Both sides read the same rows through the same
 * function now, so anything offered is bookable.
 */
export async function bookableSlotsByWeekday(clinicId: number, db: SchedulingReader = prisma) {
  const location = await db.clinicLocation.findFirst({
    // Mirrors the branch this picks when a booking names no location.
    where: { clinicId, active: true, isPrimary: true },
    select: {
      timezone: true,
      clinic: { select: { timezone: true } },
      hours: {
        orderBy: { sortOrder: "asc" },
        select: { dayOfWeek: true, openTime: true, closeTime: true, slotMinutes: true, isClosed: true },
      },
    },
  });

  // The picker must reason in the same zone the write validates in, otherwise
  // a UTC server offers the clinic's yesterday and every slot on it is refused.
  const timezone = location?.timezone || location?.clinic.timezone || "Asia/Kolkata";
  const byWeekday = new Map<number, string[]>();
  // A day marked closed is a decision; a day with no rows is a gap. The
  // booking screen words the two differently, so both are reported.
  const closedWeekdays = new Set<number>();
  if (!location) return { byWeekday, closedWeekdays, timezone };

  const windows = new Map<number, typeof location.hours>();
  for (const row of location.hours) {
    windows.set(row.dayOfWeek, [...(windows.get(row.dayOfWeek) ?? []), row]);
  }

  for (const [dayOfWeek, rows] of windows) {
    if (rows.every((row) => row.isClosed)) {
      closedWeekdays.add(dayOfWeek);
      byWeekday.set(dayOfWeek, []);
      continue;
    }
    if (rows.some((row) => row.isClosed)) {
      // A half-configured day the write would refuse anyway.
      byWeekday.set(dayOfWeek, []);
      continue;
    }
    try {
      byWeekday.set(dayOfWeek, scheduleWindowSlots(rows));
    } catch {
      // Hours that cannot produce a valid grid offer nothing, rather than
      // offering times the write is about to reject.
      byWeekday.set(dayOfWeek, []);
    }
  }
  return { byWeekday, closedWeekdays, timezone };
}

/**
 * Prove tenant ownership, configured branch hours, and resource assignments.
 * This must run inside the same Serializable transaction as the conflict check
 * and appointment write.
 */
export async function validateAppointmentResources(
  input: ValidateAppointmentResourcesInput,
  db: SchedulingReader = prisma,
): Promise<ValidatedAppointmentResources> {
  if (!Number.isInteger(input.clinicId) || input.clinicId < 1) {
    throw new InvalidScheduleInputError("Clinic identifier is invalid.");
  }
  optionalId(input.locationId, "Branch identifier");
  optionalId(input.providerId, "Provider identifier");
  optionalId(input.chairId, "Chair identifier");

  const date = parseClinicDate(input.appointmentDate);
  parseAppointmentTime(input.appointmentTime);

  const requestedLocationId = input.locationId ?? undefined;
  const location = await db.clinicLocation.findFirst({
    where: {
      clinicId: input.clinicId,
      active: true,
      ...(requestedLocationId ? { id: requestedLocationId } : { isPrimary: true }),
    },
    select: {
      id: true,
      timezone: true,
      clinic: {
        select: {
          timezone: true,
          services: {
            where: { active: true },
            select: { id: true, name: true },
          },
        },
      },
      hours: {
        where: { dayOfWeek: date.dayOfWeek },
        orderBy: { sortOrder: "asc" },
        select: {
          openTime: true,
          closeTime: true,
          slotMinutes: true,
          isClosed: true,
        },
      },
      services: {
        where: { service: { active: true } },
        select: { service: { select: { id: true, name: true } } },
      },
    },
  });
  if (!location) {
    throw new InvalidScheduleInputError("Select an active clinic branch.");
  }

  const timezone = location.timezone || location.clinic.timezone || "Asia/Kolkata";
  assertBookableClinicSlot(input.appointmentDate, input.appointmentTime, timezone, input.now);

  if (!location.hours.length) {
    throw new InvalidScheduleInputError(
      "The selected branch has no saved hours for this date.",
    );
  }
  if (location.hours.every((hours) => hours.isClosed)) {
    throw new InvalidScheduleInputError("The selected branch is closed on this date.");
  }
  if (location.hours.some((hours) => hours.isClosed)) {
    throw new InvalidScheduleInputError("The selected branch schedule is misconfigured.");
  }
  const configuredSlots = scheduleWindowSlots(location.hours);
  if (!configuredSlots.includes(input.appointmentTime)) {
    throw new InvalidScheduleInputError(
      "Select a time that matches the branch's configured appointment slots.",
    );
  }

  const [provider, chair] = await Promise.all([
    input.providerId
      ? db.clinicProvider.findFirst({
          where: {
            id: input.providerId,
            clinicId: input.clinicId,
            active: true,
            locations: { some: { locationId: location.id } },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.chairId
      ? db.clinicChair.findFirst({
          where: { id: input.chairId, clinicId: input.clinicId, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.providerId && !provider) {
    throw new InvalidScheduleInputError(
      "The selected provider is not active at this branch.",
    );
  }
  if (input.chairId && !chair) {
    throw new InvalidScheduleInputError("The selected chair is not active for this clinic.");
  }

  const treatment = input.treatment?.trim().toLocaleLowerCase("en-IN");
  // The booking screen offers two kinds of visit, not a list of treatments —
  // and this same API reads "New consultation" afterwards to decide whether
  // intake is outstanding. They are the product's own vocabulary, so checking
  // them against the service list rejected every booking the form's defaults
  // could produce.
  const visitKinds = new Set(["new consultation", "follow-up"]);
  const assignedServices = location.services.map(({ service }) => service);
  const allowedServices = assignedServices.length
    ? assignedServices
    : location.clinic.services;
  if (
    treatment
    && !visitKinds.has(treatment)
    && allowedServices.length
    && !allowedServices.some((service) => (
      service.name.trim().toLocaleLowerCase("en-IN") === treatment
    ))
  ) {
    throw new InvalidScheduleInputError(
      "Select a service available at the chosen branch.",
    );
  }

  return {
    locationId: location.id,
    providerId: input.providerId ?? null,
    chairId: input.chairId ?? null,
    timezone,
  };
}
