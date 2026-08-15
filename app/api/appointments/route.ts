import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { validateAppointmentResources } from "@/lib/appointment-scheduling";
import { ensureEncounter } from "@/lib/encounters";
import { canonicalPatientPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { findScheduleConflict } from "@/lib/schedule-conflicts";
import {
  appointmentDateFromKey,
  InvalidScheduleInputError,
} from "@/lib/scheduling-core";
import { requireApiFeature } from "@/lib/tenant";
import { appointmentSchema } from "@/lib/validations";

class ScheduleConflictError extends Error {}
const MAX_TRANSACTION_ATTEMPTS = 3;

export async function GET() {
  try {
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const appointments = await prisma.appointment.findMany({
      where: { clinicId: user.clinicId, archivedAt: null },
      orderBy: { appointmentDate: "asc" },
    });
    return NextResponse.json(appointments);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load appointments." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // Authenticate and authorize before parsing attacker-controlled request data.
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const body = await req.json();
    const data = appointmentSchema.parse(body);
    const phone = canonicalPatientPhone(data.phone);
    if (!phone) {
      throw new InvalidScheduleInputError(
        "Enter a valid 10-digit Indian mobile number.",
      );
    }

    let result;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        result = await prisma.$transaction(async (tx) => {
          const resources = await validateAppointmentResources({
            clinicId: user.clinicId,
            appointmentDate: data.appointmentDate,
            appointmentTime: data.appointmentTime,
            treatment: data.treatment,
            locationId: data.locationId,
            providerId: data.providerId,
            chairId: data.chairId,
          }, tx);
          const appointmentDate = appointmentDateFromKey(data.appointmentDate);
          const conflict = await findScheduleConflict({
            clinicId: user.clinicId,
            appointmentDate,
            appointmentTime: data.appointmentTime,
            locationId: resources.locationId,
            providerId: resources.providerId,
            chairId: resources.chairId,
          }, tx);
          if (conflict) {
            const resource = conflict.provider?.name || conflict.chair?.name || "the branch";
            throw new ScheduleConflictError(
              `${resource} is already booked at this time. Choose another slot.`,
            );
          }

          const patient = await tx.patient.upsert({
            where: { clinicId_phone: { clinicId: user.clinicId, phone } },
            update: { fullName: data.patientName },
            create: { clinicId: user.clinicId, fullName: data.patientName, phone },
          });
          const priorIntake = await tx.patientIntakeRequest.findFirst({
            where: {
              clinicId: user.clinicId,
              patientId: patient.id,
              status: { in: ["COMPLETED", "REVIEWED"] },
            },
            select: { id: true },
          });
          const appointment = await tx.appointment.create({
            data: {
              clinicId: user.clinicId,
              patientName: data.patientName,
              phone,
              appointmentDate,
              appointmentTime: data.appointmentTime,
              treatment: data.treatment,
              status: data.status,
              notes: data.notes,
              locationId: resources.locationId,
              providerId: resources.providerId,
              chairId: resources.chairId,
              patientId: patient.id,
              source: "Reception",
            },
          });
          if (data.status === "Completed") {
            await ensureEncounter(tx, {
              clinicId: user.clinicId,
              patientId: patient.id,
              appointmentId: appointment.id,
              providerId: resources.providerId,
              chairId: resources.chairId,
              createdById: user.id,
              occurredAt: appointment.appointmentDate,
              source: "APPOINTMENT",
              status: "COMPLETED",
            });
          }
          return { appointment, priorIntake };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (
          error instanceof ScheduleConflictError
          || error instanceof InvalidScheduleInputError
        ) {
          throw error;
        }
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError)
          || error.code !== "P2034"
          || attempt === MAX_TRANSACTION_ATTEMPTS - 1
        ) {
          throw error;
        }
      }
    }
    if (!result) throw new Error("Could not create appointment.");

    return NextResponse.json({
      ...result.appointment,
      intakeRequired: data.treatment.toLowerCase() === "new consultation" && !result.priorIntake,
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof ScheduleConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
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
    return NextResponse.json({ error: "Failed to create appointment." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    if (user.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only the clinic owner can archive all appointments." },
        { status: 403 },
      );
    }

    const result = await prisma.appointment.updateMany({
      where: { clinicId: user.clinicId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return NextResponse.json({ success: true, archivedCount: result.count });
  } catch (error) {
    console.error("Archive all appointments failed", error);
    return NextResponse.json({ error: "Could not archive appointments." }, { status: 500 });
  }
}
