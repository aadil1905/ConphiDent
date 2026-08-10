import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { prescriptionSchema } from "@/lib/validations";
import { requireApiPermission } from "@/lib/tenant";
import { findCompletedAppointment, localDate } from "@/lib/clinical-appointments";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const id = Number((await params).id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid prescription." }, { status: 400 });
    const data = prescriptionSchema.parse(await request.json());
    const existing = await prisma.prescription.findFirst({ where: { id, patient: { clinicId: user.clinicId } } });
    if (!existing) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
    const appointment = await findCompletedAppointment(user.clinicId, data.patientId, data.prescribedOn);
    if (!appointment) return NextResponse.json({ error: "Select one of this patient's completed appointment dates." }, { status: 400 });
    const prescription = await prisma.$transaction(async (tx) => {
      const updated = await tx.prescription.update({ where: { id }, data: { patientId: data.patientId, prescribedOn: localDate(data.prescribedOn), diagnosis: data.diagnosis || null, instructions: data.instructions || null, medicines: data.medicines } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "PRESCRIPTION_UPDATED", entityType: "PRESCRIPTION", entityId: String(updated.id), detail: `Prescription updated for patient #${updated.patientId}` } });
      return updated;
    });
    return NextResponse.json(prescription);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the prescription details." }, { status: 400 });
    return NextResponse.json({ error: "Could not update prescription." }, { status: 500 });
  }
}
