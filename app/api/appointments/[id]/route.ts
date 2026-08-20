import { reportError } from "@/lib/monitoring";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { appointmentRevision } from "@/lib/appointment-revision";
import { validateAppointmentResources } from "@/lib/appointment-scheduling";
import { ensureEncounter } from "@/lib/encounters";
import { canonicalPatientPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { findScheduleConflict } from "@/lib/schedule-conflicts";
import {
  appointmentDateFromKey,
  appointmentDateKey,
  InvalidScheduleInputError,
} from "@/lib/scheduling-core";
import { requireApiFeature } from "@/lib/tenant";
import { appointmentSchema } from "@/lib/validations";

class AppointmentNotFoundError extends Error {}
class ScheduleConflictError extends Error {}
class StaleAppointmentError extends Error {}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The edit form posts every field, so the second of two people editing one
 * appointment used to overwrite the first with values read before that first
 * save existed — silently, and including fields they never touched.
 *
 * The form now sends back the revision token for the appointment as it loaded
 * it (see `appointmentRevision`), and a save is refused if the appointment has
 * moved on since. A request that sends no token is still accepted: a stale
 * cached page or a hand-written call should not start failing, and this is a
 * guard against two people colliding rather than a permission check.
 */
function expectedRevisionFrom(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const value = (body as { expectedRevision?: unknown }).expectedRevision;
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/.test(value)) return null;
  return value;
}

function appointmentIdFrom(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new InvalidScheduleInputError("Appointment identifier is invalid.");
  }
  return id;
}

function isCapacityStatus(status: string) {
  return !["Cancelled", "No-show", "Completed"].includes(status);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    // Authenticate and authorize before parsing attacker-controlled request data.
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const { id } = await params;
    const appointmentId = appointmentIdFrom(id);
    const body = await request.json();
    const expectedRevision = expectedRevisionFrom(body);
    const data = appointmentSchema.partial().parse(body);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    let appointment;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        appointment = await prisma.$transaction(async (tx) => {
          const current = await tx.appointment.findFirst({
            where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
          });
          if (!current) throw new AppointmentNotFoundError();
          if (expectedRevision && appointmentRevision(current) !== expectedRevision) {
            throw new StaleAppointmentError();
          }

          const currentDateKey = appointmentDateKey(current.appointmentDate);
          const dateKey = data.appointmentDate ?? currentDateKey;
          const appointmentTime = data.appointmentTime ?? current.appointmentTime;
          const locationId = data.locationId === undefined ? current.locationId : data.locationId;
          const providerId = data.providerId === undefined ? current.providerId : data.providerId;
          const chairId = data.chairId === undefined ? current.chairId : data.chairId;
          const status = data.status ?? current.status;
          const scheduleChanged = dateKey !== currentDateKey
            || appointmentTime !== current.appointmentTime
            || locationId !== current.locationId
            || providerId !== current.providerId
            || chairId !== current.chairId;
          const reactivated = data.status !== undefined
            && isCapacityStatus(status)
            && !isCapacityStatus(current.status);

          let resolvedLocationId = locationId;
          if (scheduleChanged || reactivated) {
            if (scheduleChanged && !isCapacityStatus(status)) {
              throw new InvalidScheduleInputError(
                "Restore the appointment to Pending or Confirmed before changing its schedule.",
              );
            }
            const resources = await validateAppointmentResources({
              clinicId: user.clinicId,
              appointmentDate: dateKey,
              appointmentTime,
              treatment: data.treatment ?? current.treatment,
              locationId,
              providerId,
              chairId,
            }, tx);
            resolvedLocationId = resources.locationId;

            const conflict = await findScheduleConflict({
              clinicId: user.clinicId,
              appointmentDate: appointmentDateFromKey(dateKey),
              appointmentTime,
              locationId: resources.locationId,
              providerId: resources.providerId,
              chairId: resources.chairId,
              excludeAppointmentId: current.id,
            }, tx);
            if (conflict) {
              const resource = conflict.provider?.name || conflict.chair?.name || "the branch";
              throw new ScheduleConflictError(
                `${resource} is already booked at this time. Choose another slot.`,
              );
            }
          }

          const nextPatientName = data.patientName ?? current.patientName;
          const currentCanonicalPhone = canonicalPatientPhone(current.phone);
          const suppliedPhone = data.phone === undefined
            ? currentCanonicalPhone
            : canonicalPatientPhone(data.phone);
          if (data.phone !== undefined && !suppliedPhone) {
            throw new InvalidScheduleInputError(
              "Enter a valid 10-digit Indian mobile number.",
            );
          }
          const identityChanged = (
            data.patientName !== undefined
            && nextPatientName !== current.patientName
          ) || (
            data.phone !== undefined
            && suppliedPhone !== currentCanonicalPhone
          );
          if (identityChanged && !suppliedPhone) {
            throw new InvalidScheduleInputError(
              "Enter a valid 10-digit Indian mobile number.",
            );
          }

          const patient = identityChanged
            ? await tx.patient.upsert({
                where: {
                  clinicId_phone: {
                    clinicId: user.clinicId,
                    phone: suppliedPhone!,
                  },
                },
                update: { fullName: nextPatientName },
                create: {
                  clinicId: user.clinicId,
                  fullName: nextPatientName,
                  phone: suppliedPhone!,
                },
              })
            : null;

          const changed = await tx.appointment.updateMany({
            where: { id: current.id, clinicId: user.clinicId, archivedAt: null },
            data: {
              patientName: data.patientName !== undefined
                && nextPatientName !== current.patientName
                ? nextPatientName
                : undefined,
              phone: data.phone !== undefined
                && suppliedPhone !== currentCanonicalPhone
                ? suppliedPhone ?? undefined
                : undefined,
              appointmentDate: dateKey !== currentDateKey
                ? appointmentDateFromKey(dateKey)
                : undefined,
              appointmentTime: appointmentTime !== current.appointmentTime
                ? appointmentTime
                : undefined,
              treatment: data.treatment !== undefined
                && data.treatment !== current.treatment
                ? data.treatment
                : undefined,
              status: data.status !== undefined
                && data.status !== current.status
                ? data.status
                : undefined,
              notes: data.notes !== undefined
                && data.notes !== current.notes
                ? data.notes
                : undefined,
              locationId: (scheduleChanged || reactivated) ? resolvedLocationId : undefined,
              providerId: (scheduleChanged || reactivated) ? providerId : undefined,
              chairId: (scheduleChanged || reactivated) ? chairId : undefined,
              patientId: patient?.id,
            },
          });
          if (changed.count !== 1) throw new AppointmentNotFoundError();
          const updated = await tx.appointment.findUniqueOrThrow({
            where: { id: current.id },
          });

          const encounterPatientId = patient?.id ?? current.patientId;
          if (data.status === "Completed" && encounterPatientId) {
            await ensureEncounter(tx, {
              clinicId: user.clinicId,
              patientId: encounterPatientId,
              appointmentId: updated.id,
              providerId: updated.providerId,
              chairId: updated.chairId,
              createdById: user.id,
              occurredAt: updated.appointmentDate,
              source: "APPOINTMENT",
              status: "COMPLETED",
            });
          }
          return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (
          error instanceof AppointmentNotFoundError
          || error instanceof ScheduleConflictError
          || error instanceof StaleAppointmentError
          || error instanceof InvalidScheduleInputError
        ) {
          throw error;
        }
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError)
          || error.code !== "P2034"
          || attempt === 2
        ) {
          throw error;
        }
      }
    }
    if (!appointment) throw new Error("Could not update appointment.");
    return NextResponse.json(appointment);
  } catch (error) {
    await reportError(error, { where: "api/appointments/[id]" });
    if (error instanceof StaleAppointmentError) {
      return NextResponse.json({
        error: "Somebody else changed this appointment while you had it open. Reload it and make your change again — saving now would undo theirs.",
        code: "STALE_APPOINTMENT",
      }, { status: 409 });
    }
    if (error instanceof ScheduleConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof AppointmentNotFoundError) {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    }
    if (error instanceof InvalidScheduleInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update appointment." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const { id } = await params;
    const appointmentId = appointmentIdFrom(id);
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    await reportError(error, { where: "api/appointments/[id]" });
    if (error instanceof InvalidScheduleInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not archive appointment." }, { status: 500 });
  }
}
