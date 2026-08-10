import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appointmentSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiFeature } from "@/lib/tenant";
import { findScheduleConflict } from "@/lib/schedule-conflicts";
import { Prisma } from "@prisma/client";

class AppointmentNotFoundError extends Error {}
class ScheduleConflictError extends Error {}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const { id } = await params;
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) {
      return NextResponse.json({ error: "Invalid appointment id." }, { status: 400 });
    }

    const body = await request.json();
    const data = appointmentSchema.partial().parse(body);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    const existingAppointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
      select: { id: true, patientName: true, phone: true, patientId: true, appointmentDate: true, appointmentTime: true, providerId: true, chairId: true },
    });

    if (!existingAppointment) {
      return NextResponse.json(
        { error: "Appointment not found." },
        { status: 404 }
      );
    }

    const nextPatientName = data.patientName ?? existingAppointment.patientName;
    const nextPhone = data.phone
      ? data.phone.replace(/\D/g, "").slice(-10)
      : existingAppointment.phone.replace(/\D/g, "").slice(-10);
    const shouldSavePatient = data.status === "Completed";
    const providerId = data.providerId === undefined ? existingAppointment.providerId : data.providerId;
    const chairId = data.chairId === undefined ? existingAppointment.chairId : data.chairId;
    let appointment;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        appointment = await prisma.$transaction(async (tx) => {
          const current = await tx.appointment.findFirst({ where: { id: existingAppointment.id, clinicId: user.clinicId, archivedAt: null }, select: { id: true } });
          if (!current) throw new AppointmentNotFoundError();
          const conflict = await findScheduleConflict({ clinicId: user.clinicId, appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : existingAppointment.appointmentDate, appointmentTime: data.appointmentTime ?? existingAppointment.appointmentTime, providerId, chairId, excludeAppointmentId: existingAppointment.id }, tx);
          if (conflict) throw new ScheduleConflictError(`${conflict.provider?.name || conflict.chair?.name || "The selected resource"} is already booked at this time for ${conflict.patientName}.`);
          const completedPatient = shouldSavePatient ? await tx.patient.upsert({ where: { clinicId_phone: { clinicId: user.clinicId, phone: nextPhone } }, update: { fullName: nextPatientName }, create: { clinicId: user.clinicId, fullName: nextPatientName, phone: nextPhone } }) : null;
          return tx.appointment.update({
            where: { id: existingAppointment.id },
            data: {
        patientName:
          data.patientName !== undefined
            ? data.patientName
            : undefined,

        phone:
          data.phone !== undefined
            ? nextPhone
            : undefined,

        appointmentDate:
          data.appointmentDate !== undefined
            ? new Date(data.appointmentDate)
            : undefined,

        appointmentTime:
          data.appointmentTime !== undefined
            ? data.appointmentTime
            : undefined,

        treatment:
          data.treatment !== undefined
            ? data.treatment
            : undefined,

        status:
          data.status !== undefined
            ? data.status
            : undefined,

        notes:
          data.notes !== undefined
            ? data.notes
            : undefined,

        providerId,
        chairId,

        patientId: completedPatient?.id,
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (error instanceof AppointmentNotFoundError || error instanceof ScheduleConflictError) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
      }
    }
    if (!appointment) throw new Error("Could not update appointment.");

    return NextResponse.json(appointment);
  } catch (error) {
    console.error(error);
    if (error instanceof ScheduleConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AppointmentNotFoundError) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Appointment not found or could not be updated." },
      { status: 404 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { user, response } = await requireApiFeature("appointments", "manageSchedule");
    if (!user) return response;
    const { id } = await params;
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) {
      return NextResponse.json({ error: "Invalid appointment id." }, { status: 400 });
    }

    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) return NextResponse.json({ error: "Appointment not found." }, { status: 404 });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Appointment not found or could not be archived." },
      { status: 404 }
    );
  }
}
