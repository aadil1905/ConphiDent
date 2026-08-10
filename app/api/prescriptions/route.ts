import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validations";
import { requireApiPermission } from "@/lib/tenant";
import { findCompletedAppointment, localDate } from "@/lib/clinical-appointments";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const data = prescriptionSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    const appointment = await findCompletedAppointment(user.clinicId, patient.id, data.prescribedOn);
    if (!appointment) {
      return NextResponse.json(
        { error: "Select one of this patient's completed appointment dates." },
        { status: 400 },
      );
    }

    const prescription = await prisma.$transaction(async (tx) => {
      const created = await tx.prescription.create({
        data: {
          patientId: patient.id,
          prescribedOn: localDate(data.prescribedOn),
          diagnosis: data.diagnosis || null,
          instructions: data.instructions || null,
          medicines: data.medicines,
        },
      });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "PRESCRIPTION_CREATED", entityType: "PRESCRIPTION", entityId: String(created.id), detail: `Prescription issued for patient #${patient.id}` } });
      return created;
    });
    return NextResponse.json(prescription, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Please check the prescription details.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save prescription." }, { status: 500 });
  }
}
