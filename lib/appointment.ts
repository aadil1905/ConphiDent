import { Prisma } from "@prisma/client";
import { prisma, type Db } from "@/lib/prisma";
import {
  inspectLocationAvailability,
  type LocationAvailabilityStatus,
} from "@/lib/availability";
import { findScheduleConflict } from "@/lib/schedule-conflicts";
import {
  appointmentDateFromKey,
  assertBookableClinicSlot,
  InvalidScheduleInputError,
} from "@/lib/scheduling-core";
import { canonicalWhatsAppPhone } from "@/lib/phone";

export class AppointmentSlotUnavailableError extends Error {}
export class InvalidAppointmentLocationError extends Error {}
export class InvalidAppointmentResourceError extends Error {}
export class AppointmentNotAvailableError extends Error {}

export interface AppointmentData {
  clinicId: number;
  locationId: number;
  name: string;
  phone: string;
  date: string;
  time: string;
  reason: string;
  providerId?: number | null;
  chairId?: number | null;
  bookingId?: number;
}

/** Preserve the India-first 10-digit identity used by legacy Patient rows. */
function canonicalPatientPhone(value: string) {
  const canonical = canonicalWhatsAppPhone(value);
  return canonical?.startsWith("91") && canonical.length === 12
    ? canonical.slice(2)
    : canonical;
}

export async function saveAppointment(data: AppointmentData) {
  assertPositiveId(data.clinicId, "Clinic identifier");
  assertPositiveId(data.locationId, "Branch identifier");
  assertOptionalPositiveId(data.providerId, "Provider identifier");
  assertOptionalPositiveId(data.chairId, "Chair identifier");
  assertOptionalPositiveId(data.bookingId, "Booking identifier");
  const appointmentDate = appointmentDateFromKey(data.date);
  const patientPhone = canonicalPatientPhone(data.phone);
  if (!data.name.trim() || !data.phone.trim() || !data.reason.trim()) {
    throw new InvalidScheduleInputError("Appointment details are incomplete.");
  }
  if (!patientPhone) {
    throw new InvalidScheduleInputError("Appointment contact identity is invalid.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const location = await activeLocation(tx, data.clinicId, data.locationId);
        if (!location) {
          throw new InvalidAppointmentLocationError("The selected branch is not available.");
        }
        await assertResourcesAvailable(tx, {
          clinicId: data.clinicId,
          locationId: data.locationId,
          providerId: data.providerId,
          chairId: data.chairId,
        });
        assertBookableClinicSlot(
          data.date,
          data.time,
          location.timezone || location.clinic.timezone,
        );
        assertLocationSlotAvailable(await inspectLocationAvailability(
          data.clinicId,
          data.locationId,
          data.date,
          {
            providerId: data.providerId,
            chairId: data.chairId,
            desiredTime: data.time,
          },
          tx,
        ));

        const conflict = await findScheduleConflict({
          clinicId: data.clinicId,
          locationId: data.locationId,
          providerId: data.providerId,
          chairId: data.chairId,
          appointmentDate,
          appointmentTime: data.time,
        }, tx);
        if (conflict) {
          throw new AppointmentSlotUnavailableError("Appointment slot is no longer available.");
        }

        const canonicalPhone = canonicalWhatsAppPhone(data.phone);
        const phoneCandidates = Array.from(new Set(
          [patientPhone, canonicalPhone].filter((phone): phone is string => Boolean(phone)),
        ));
        const existingPatient = await tx.patient.findFirst({
          where: { clinicId: data.clinicId, phone: { in: phoneCandidates } },
          orderBy: { updatedAt: "desc" },
        });
        const patient = existingPatient
          ? await tx.patient.update({
              where: { id: existingPatient.id },
              data: { fullName: data.name.trim() },
            })
          : await tx.patient.create({
              data: {
                clinicId: data.clinicId,
                fullName: data.name.trim(),
                phone: patientPhone,
              },
            });
        const appointment = await tx.appointment.create({
          data: {
            clinicId: data.clinicId,
            locationId: data.locationId,
            providerId: data.providerId ?? null,
            chairId: data.chairId ?? null,
            patientName: data.name.trim(),
            phone: patient.phone,
            appointmentDate,
            appointmentTime: data.time,
            treatment: data.reason.trim(),
            patientId: patient.id,
            source: "WhatsApp",
            status: "Confirmed",
          },
        });
        if (data.bookingId) {
          const marked = await tx.whatsAppBooking.updateMany({
            where: {
              id: data.bookingId,
              conversation: { clinicId: data.clinicId },
            },
            data: { step: "booked", reason: `BOOKED:${appointment.id}` },
          });
          if (marked.count !== 1) {
            throw new AppointmentNotAvailableError(
              "The WhatsApp booking state changed before confirmation.",
            );
          }
        }
        return appointment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof AppointmentSlotUnavailableError
        || error instanceof InvalidAppointmentLocationError
        || error instanceof InvalidAppointmentResourceError
        || error instanceof AppointmentNotAvailableError
        || error instanceof InvalidScheduleInputError
      ) throw error;
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError)
        || error.code !== "P2034"
        || attempt === 2
      ) throw error;
    }
  }
  throw new Error("Could not create appointment.");
}

export interface WhatsAppAppointmentMutation {
  clinicId: number;
  appointmentId: number;
  phoneCandidates: string[];
  bookingId?: number;
}

export interface WhatsAppRescheduleData extends WhatsAppAppointmentMutation {
  fallbackLocationId: number;
  date: string;
  time: string;
}

/** Ownership-checked, serializable reschedule that preserves treatment. */
export async function rescheduleAppointmentForWhatsApp(data: WhatsAppRescheduleData) {
  const phoneCandidates = validateMutationIdentity(data);
  assertPositiveId(data.fallbackLocationId, "Fallback branch identifier");
  const appointmentDate = appointmentDateFromKey(data.date);

  return serializableWithRetry(async (tx) => {
    const current = await tx.appointment.findFirst({
      where: {
        id: data.appointmentId,
        clinicId: data.clinicId,
        phone: { in: phoneCandidates },
        archivedAt: null,
        status: { notIn: ["Cancelled", "Completed", "No-show"] },
      },
      select: {
        id: true,
        status: true,
        locationId: true,
        providerId: true,
        chairId: true,
      },
    });
    if (!current) {
      throw new AppointmentNotAvailableError(
        "The appointment is no longer available to reschedule.",
      );
    }

    const locationId = current.locationId || data.fallbackLocationId;
    const location = await activeLocation(tx, data.clinicId, locationId);
    if (!location) {
      throw new InvalidAppointmentLocationError(
        "The appointment branch is no longer available.",
      );
    }
    await assertResourcesAvailable(tx, {
      clinicId: data.clinicId,
      locationId,
      providerId: current.providerId,
      chairId: current.chairId,
    });
    assertBookableClinicSlot(
      data.date,
      data.time,
      location.timezone || location.clinic.timezone,
    );
    assertLocationSlotAvailable(await inspectLocationAvailability(
      data.clinicId,
      locationId,
      data.date,
      {
        providerId: current.providerId,
        chairId: current.chairId,
        excludeAppointmentId: current.id,
        desiredTime: data.time,
      },
      tx,
    ));

    const conflict = await findScheduleConflict({
      clinicId: data.clinicId,
      locationId,
      providerId: current.providerId,
      chairId: current.chairId,
      appointmentDate,
      appointmentTime: data.time,
      excludeAppointmentId: current.id,
    }, tx);
    if (conflict) {
      throw new AppointmentSlotUnavailableError("Appointment slot is no longer available.");
    }

    const updated = await tx.appointment.updateMany({
      where: {
        id: current.id,
        clinicId: data.clinicId,
        phone: { in: phoneCandidates },
        archivedAt: null,
        status: current.status,
      },
      // Treatment is deliberately omitted so a reschedule never rewrites care intent.
      data: {
        locationId,
        appointmentDate,
        appointmentTime: data.time,
        status: "Confirmed",
      },
    });
    if (updated.count !== 1) {
      throw new AppointmentNotAvailableError(
        "The appointment changed while it was being rescheduled.",
      );
    }
    await markBookingState(tx, data, "rescheduled", `RESCHEDULED:${current.id}`);
    return tx.appointment.findUniqueOrThrow({ where: { id: current.id } });
  });
}

/** Explicit confirmation is required before this ownership-checked transition. */
export async function cancelAppointmentForWhatsApp(data: WhatsAppAppointmentMutation) {
  const phoneCandidates = validateMutationIdentity(data);
  return serializableWithRetry(async (tx) => {
    const current = await tx.appointment.findFirst({
      where: {
        id: data.appointmentId,
        clinicId: data.clinicId,
        phone: { in: phoneCandidates },
        archivedAt: null,
        status: { notIn: ["Cancelled", "Completed", "No-show"] },
      },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new AppointmentNotAvailableError(
        "The appointment is no longer available to cancel.",
      );
    }

    const updated = await tx.appointment.updateMany({
      where: {
        id: current.id,
        clinicId: data.clinicId,
        phone: { in: phoneCandidates },
        archivedAt: null,
        status: current.status,
      },
      data: { status: "Cancelled" },
    });
    if (updated.count !== 1) {
      throw new AppointmentNotAvailableError(
        "The appointment changed while it was being cancelled.",
      );
    }
    await markBookingState(tx, data, "cancelled", `CANCELLED:${current.id}`);
    return tx.appointment.findUniqueOrThrow({ where: { id: current.id } });
  });
}

function assertPositiveId(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InvalidScheduleInputError(`${label} is invalid.`);
  }
}

function assertOptionalPositiveId(value: number | null | undefined, label: string) {
  if (value != null) assertPositiveId(value, label);
}

function assertLocationSlotAvailable(status: { status: LocationAvailabilityStatus }) {
  if (status.status === "AVAILABLE") return;
  if (status.status === "PAST") {
    throw new InvalidScheduleInputError(
      "Appointments must be scheduled in the future for the clinic's timezone.",
    );
  }
  if (status.status === "MISCONFIGURED") {
    throw new InvalidAppointmentLocationError(
      "The selected branch hours are incomplete or invalid.",
    );
  }
  throw new AppointmentSlotUnavailableError(
    status.status === "FULL"
      ? "Appointment slot is no longer available."
      : "The selected time is outside the branch's configured booking hours.",
  );
}

function validateMutationIdentity(data: WhatsAppAppointmentMutation) {
  assertPositiveId(data.clinicId, "Clinic identifier");
  assertPositiveId(data.appointmentId, "Appointment identifier");
  assertOptionalPositiveId(data.bookingId, "Booking identifier");
  const phoneCandidates = Array.from(new Set(
    data.phoneCandidates.flatMap((phone) => {
      const canonical = canonicalWhatsAppPhone(phone);
      if (!canonical) return [];
      const legacyIndian = canonical.startsWith("91") && canonical.length === 12
        ? canonical.slice(2)
        : null;
      return legacyIndian ? [canonical, legacyIndian] : [canonical];
    }),
  ));
  if (!phoneCandidates.length) {
    throw new InvalidScheduleInputError("Appointment contact identity is missing.");
  }
  return phoneCandidates;
}

function activeLocation(
  tx: Db,
  clinicId: number,
  locationId: number,
) {
  return tx.clinicLocation.findFirst({
    where: { id: locationId, clinicId, active: true },
    select: {
      id: true,
      timezone: true,
      clinic: { select: { timezone: true } },
    },
  });
}

async function assertResourcesAvailable(
  tx: Db,
  input: {
    clinicId: number;
    locationId: number;
    providerId?: number | null;
    chairId?: number | null;
  },
) {
  const [provider, chair] = await Promise.all([
    input.providerId
      ? tx.clinicProvider.findFirst({
          where: {
            id: input.providerId,
            clinicId: input.clinicId,
            active: true,
            locations: { some: { locationId: input.locationId } },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.chairId
      ? tx.clinicChair.findFirst({
          where: {
            id: input.chairId,
            clinicId: input.clinicId,
            active: true,
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if ((input.providerId && !provider) || (input.chairId && !chair)) {
    throw new InvalidAppointmentResourceError(
      "The selected provider or chair is not available for this clinic and branch.",
    );
  }
}

async function markBookingState(
  tx: Db,
  data: WhatsAppAppointmentMutation,
  step: string,
  reason: string,
) {
  if (!data.bookingId) return;
  const marked = await tx.whatsAppBooking.updateMany({
    where: {
      id: data.bookingId,
      conversation: { clinicId: data.clinicId },
    },
    data: { step, reason },
  });
  if (marked.count !== 1) {
    throw new AppointmentNotAvailableError(
      "The WhatsApp booking state changed before confirmation.",
    );
  }
}

async function serializableWithRetry<T>(
  work: (tx: Db) => Promise<T>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError)
        || error.code !== "P2034"
        || attempt === 2
      ) throw error;
    }
  }
  throw new Error("The appointment could not be updated after concurrent changes.");
}
