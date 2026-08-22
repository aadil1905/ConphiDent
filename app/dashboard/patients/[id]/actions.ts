"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type VisitResult = { ok: true } | { ok: false; message: string };

/**
 * "Mark completed" from a visit row on the patient's own profile, without
 * leaving for the appointment page or Today. Same transition and permission
 * as the chair-list stepper (app/dashboard/today-actions.ts markCompletedAction)
 * — kept as its own action because that one only revalidates /dashboard, and a
 * row here needs the patient page to reflect the flip too.
 */
export async function markVisitCompletedAction(appointmentId: number): Promise<VisitResult> {
  try {
    const user = await requirePermission("manageSchedule");
    const visit = await prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
      select: { id: true, patientId: true, status: true },
    });
    if (!visit) return { ok: false, message: "That visit has moved on — refresh to see where it is now." };
    if (visit.status === "Cancelled") return { ok: false, message: "That visit was cancelled." };
    if (visit.status === "Completed") return { ok: true };

    await prisma.appointment.update({
      where: { id: appointmentId, clinicId: user.clinicId },
      data: { status: "Completed" },
    });
    await recordAudit({
      clinicId: user.clinicId,
      userId: user.id,
      action: "APPOINTMENT_COMPLETED",
      entityType: "APPOINTMENT",
      entityId: String(appointmentId),
      detail: "Marked completed from the patient's visit list",
    });

    revalidatePath("/dashboard");
    if (visit.patientId) revalidatePath(`/dashboard/patients/${visit.patientId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "That didn't save — your connection dropped. Nothing was lost; try again." };
  }
}

/** Prepares only the tenant-scoped portal record. Activation requires a real, tested OTP delivery provider. */
export async function preparePatientPortalAction(formData: FormData) {
  const user = await requirePermission("managePatients");
  const patientId = Number(formData.get("patientId"));
  if (!Number.isInteger(patientId) || patientId < 1) return;
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId }, select: { id: true } });
  if (!patient) return;

  const portal = await prisma.patientPortalAccess.upsert({
    where: { patientId: patient.id },
    create: { clinicId: user.clinicId, patientId: patient.id },
    update: {},
  });
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "PATIENT_PORTAL_PREPARED", entityType: "PATIENT", entityId: String(patient.id), detail: `Patient portal foundation prepared (${portal.status.toLowerCase()}); no access link or OTP was issued.` });
  revalidatePath(`/dashboard/patients/${patient.id}`);
}
