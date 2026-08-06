"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const path = "/dashboard/laboratory";
const statuses = ["SENT_TO_LAB", "IN_PROGRESS", "WAX_STAGE", "METAL_STAGE", "CERAMIC_STAGE", "READY", "DELIVERED", "COMPLETED", "REWORK", "CANCELLED"];

export async function createLabCaseAction(formData: FormData) {
  const user = await requireUser();
  const patientId = Number(formData.get("patientId"));
  const caseType = String(formData.get("caseType") || "").trim();
  const labName = String(formData.get("labName") || "").trim();
  if (!Number.isInteger(patientId) || !caseType || !labName) return;
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId }, select: { id: true } });
  if (!patient) return;
  const due = String(formData.get("dueDate") || "");
  const created = await prisma.labCase.create({ data: {
    clinicId: user.clinicId, patientId, caseType, labName, orderNumber: `LAB-${Date.now().toString().slice(-7)}`,
    dueDate: due ? new Date(due) : null, teeth: String(formData.get("teeth") || "").trim() || null,
    priority: String(formData.get("priority") || "NORMAL"), treatingDoctor: String(formData.get("doctor") || "").trim() || null,
    technicianName: String(formData.get("technician") || "").trim() || null, labPhone: String(formData.get("phone") || "").trim() || null,
    shade: String(formData.get("shade") || "").trim() || null, material: String(formData.get("material") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  }});
  await prisma.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: created.id, type: "CREATED", actorName: user.fullName, notes: "Laboratory prescription created." } });
  revalidatePath(path);
}

export async function updateLabStatusAction(formData: FormData) {
  const user = await requireUser(); const id = Number(formData.get("id")); const status = String(formData.get("status") || "");
  if (!Number.isInteger(id) || !statuses.includes(status)) return;
  const result = await prisma.labCase.updateMany({ where: { id, clinicId: user.clinicId }, data: { status, deliveredAt: status === "DELIVERED" ? new Date() : undefined } });
  if (result.count) await prisma.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: id, type: status, actorName: user.fullName, notes: String(formData.get("notes") || "").trim() || null } });
  revalidatePath(path);
}

export async function createReworkAction(formData: FormData) {
  const user = await requireUser(); const id = Number(formData.get("id")); const reason = String(formData.get("reason") || "").trim();
  const original = Number.isInteger(id) ? await prisma.labCase.findFirst({ where: { id, clinicId: user.clinicId } }) : null;
  if (!original || !reason) return;
  const requestedDueDate = String(formData.get("dueDate") || "");
  await prisma.$transaction(async (tx) => {
    const updatedOriginal = await tx.labCase.update({
      where: { id: original.id },
      data: { status: "REWORK", reworkCount: { increment: 1 } },
    });
    const rework = await tx.labCase.create({
      data: {
        clinicId: original.clinicId, patientId: original.patientId, treatmentPlanId: original.treatmentPlanId,
        labName: original.labName, caseType: original.caseType, dueDate: requestedDueDate ? new Date(requestedDueDate) : original.dueDate,
        notes: original.notes, orderNumber: `${original.orderNumber || `LAB-${original.id}`}-R${updatedOriginal.reworkCount}`,
        teeth: original.teeth, priority: original.priority, treatingDoctor: original.treatingDoctor, assistant: original.assistant,
        technicianName: original.technicianName, labPhone: original.labPhone, labWhatsapp: original.labWhatsapp, shade: original.shade,
        material: original.material, marginType: original.marginType, occlusionNotes: original.occlusionNotes, biteNotes: original.biteNotes,
        attachments: original.attachments, status: "REWORK", version: original.version + 1,
        parentCaseId: original.parentCaseId || original.id, reworkReason: reason, reworkCount: updatedOriginal.reworkCount,
      },
    });
    await tx.labCaseEvent.createMany({
      data: [
        { clinicId: user.clinicId, labCaseId: original.id, type: "REWORK_CREATED", actorName: user.fullName, notes: reason },
        { clinicId: user.clinicId, labCaseId: rework.id, type: "REWORK_CREATED", actorName: user.fullName, notes: `Version ${rework.version}: ${reason}` },
      ],
    });
  });
  revalidatePath(path);
}
