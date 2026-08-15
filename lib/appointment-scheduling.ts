import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  assertBookableClinicSlot,
  InvalidScheduleInputError,
  parseAppointmentTime,
  parseClinicDate,
  scheduleWindowSlots,
} from "@/lib/scheduling-core";

type SchedulingReader = Pick<
  Prisma.TransactionClient,
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
  const assignedServices = location.services.map(({ service }) => service);
  const allowedServices = assignedServices.length
    ? assignedServices
    : location.clinic.services;
  if (
    treatment
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
