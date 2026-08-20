"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/permissions";
import { generateFollowUpTasks } from "@/lib/follow-ups";
import { prisma } from "@/lib/prisma";
import { followUpWhatsAppPurpose, patientSafeFollowUpMessage } from "@/lib/patient-whatsapp-policy";
import { queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";

export async function generateFollowUpsAction() {
  const user = await requirePermission("manageSchedule");
  await generateFollowUpTasks(user.clinicId);
  revalidatePath("/dashboard/growth");
}

export async function sendFollowUpAction(formData: FormData) {
  const user = await requirePermission("sendWhatsApp");
  const id = Number(formData.get("id"));
  const task = await prisma.followUpTask.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!task || task.status !== "PENDING") return;
  if (!task.patientId) {
    await prisma.followUpTask.updateMany({ where: { id: task.id, clinicId: user.clinicId, status: "PENDING" }, data: { status: "FAILED", errorMessage: "Link this follow-up to an active patient before sending WhatsApp." } });
    revalidatePath("/dashboard/growth");
    return;
  }
  if (formData.get("consentConfirmed") !== "1") {
    await prisma.followUpTask.updateMany({ where: { id: task.id, clinicId: user.clinicId, status: "PENDING" }, data: { status: "FAILED", errorMessage: "Confirm the patient's current WhatsApp consent before sending." } });
    revalidatePath("/dashboard/growth");
    return;
  }

  try {
    const claimed = await prisma.followUpTask.updateMany({ where: { id: task.id, clinicId: user.clinicId, status: "PENDING" }, data: { status: "QUEUED", lastAttemptAt: new Date(), attemptCount: { increment: 1 }, errorMessage: null } });
    if (!claimed.count) return;
    const purpose = followUpWhatsAppPurpose(task.taskType);
    const templateByPurpose = {
      BILLING_COMMUNICATION: process.env.WHATSAPP_PAYMENT_FOLLOW_UP_TEMPLATE,
      LABORATORY_COMMUNICATION: process.env.WHATSAPP_LAB_FOLLOW_UP_TEMPLATE,
      CLINICAL_FOLLOW_UP: process.env.WHATSAPP_CLINICAL_FOLLOW_UP_TEMPLATE,
      APPOINTMENT_COMMUNICATION: process.env.WHATSAPP_APPOINTMENT_FOLLOW_UP_TEMPLATE,
      CARE_COMMUNICATION: process.env.WHATSAPP_CARE_FOLLOW_UP_TEMPLATE,
      PATIENT_INTAKE: undefined,
    } as const;
    const content = patientSafeFollowUpMessage(task.taskType, task.patientName, user.clinic.brandName || user.clinic.name);
    const queued = await queuePatientWhatsAppMessage({
      clinicId: user.clinicId,
      patientId: task.patientId,
      phone: task.phone,
      content,
      purpose,
      sourceType: "FOLLOW_UP",
      sourceId: String(task.id),
      idempotencyKey: `follow-up:${task.id}:send`,
      actorUserId: user.id,
      actorRole: user.role,
      consentConfirmed: true,
      consentEvidence: "Staff confirmed the patient agreed to receive this follow-up on WhatsApp",
      auditAction: "FOLLOW_UP_WHATSAPP_QUEUED",
      preferredTemplateName: templateByPurpose[purpose],
      preferredTemplateLanguage: process.env.WHATSAPP_FOLLOW_UP_TEMPLATE_LANG || "en",
      templateParameters: [task.patientName],
      redactContent: true,
    });
    await processScheduledWhatsAppMessages(new Date(), queued.message.id);
    const delivered = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id: queued.message.id, clinicId: user.clinicId }, select: { status: true, failureReason: true } });
    await prisma.followUpTask.updateMany({
      where: { id: task.id, clinicId: user.clinicId },
      data: delivered?.status === "SENT"
        ? { status: "SENT", sentAt: new Date(), errorMessage: null }
        : delivered?.status === "DEAD_LETTER" || delivered?.status === "CANCELLED"
          ? { status: "FAILED", errorMessage: delivered.failureReason || "WhatsApp delivery was blocked." }
          : { status: "QUEUED", errorMessage: delivered?.failureReason || null },
    });
  } catch (error) {
    await prisma.followUpTask.updateMany({ where: { id: task.id, clinicId: user.clinicId, status: "QUEUED" }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unable to queue WhatsApp message" } });
  }
  revalidatePath("/dashboard/growth");
}

export async function completeFollowUpAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  const id = Number(formData.get("id"));
  const outcome = String(formData.get("outcome") || "OTHER").trim().slice(0, 80);
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "QUEUED", "SENT", "FAILED"] } }, data: { status: "COMPLETED", outcome, completedAt: new Date() } });
  revalidatePath("/dashboard/growth");
}

export async function assignFollowUpAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  const id = Number(formData.get("id"));
  const assignedUserId = Number(formData.get("assignedUserId")) || null;
  if (!Number.isInteger(id)) return;
  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedUserId, clinicId: user.clinicId, active: true }, select: { id: true } });
    if (!assignee) return;
  }
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { assignedUserId } });
  revalidatePath("/dashboard/growth");
}

export async function snoozeFollowUpAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  const id = Number(formData.get("id"));
  const scheduledFor = String(formData.get("scheduledFor") || "");
  if (!Number.isInteger(id) || !scheduledFor) return;
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "FAILED", "SENT"] } }, data: { status: "PENDING", scheduledFor: new Date(scheduledFor), snoozedUntil: new Date(scheduledFor) } });
  revalidatePath("/dashboard/growth");
}

export async function cancelFollowUpAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "QUEUED", "FAILED", "SENT"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  revalidatePath("/dashboard/growth");
}
