"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

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
