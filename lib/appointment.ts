import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AppointmentSlotUnavailableError extends Error {}

interface AppointmentData {
  clinicId: number;
  locationId: number;
  name: string;
  phone: string;
  date: string;
  time: string;
  reason: string;
}

export async function saveAppointment(data: AppointmentData) {
  const appointmentDate = new Date(`${data.date}T12:00:00`);

  if (Number.isNaN(appointmentDate.getTime())) {
    throw new Error("Invalid appointment date");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const occupied = await tx.appointment.findFirst({ where: { clinicId: data.clinicId, locationId: data.locationId, appointmentDate, appointmentTime: data.time, archivedAt: null, status: { notIn: ["Cancelled", "No-show"] } }, select: { id: true } });
        if (occupied) throw new AppointmentSlotUnavailableError("Appointment slot is no longer available.");
        const patient = await tx.patient.upsert({ where: { clinicId_phone: { clinicId: data.clinicId, phone: data.phone } }, update: { fullName: data.name }, create: { clinicId: data.clinicId, fullName: data.name, phone: data.phone } });
        return tx.appointment.create({ data: { clinicId: data.clinicId, locationId: data.locationId, patientName: data.name, phone: data.phone, appointmentDate, appointmentTime: data.time, treatment: data.reason, patientId: patient.id, source: "WhatsApp" } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AppointmentSlotUnavailableError) throw error;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Could not create appointment.");
}
