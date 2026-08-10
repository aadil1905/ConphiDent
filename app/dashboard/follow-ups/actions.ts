"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { generateFollowUpTasks } from "@/lib/follow-ups";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

export async function generateFollowUpsAction() {
  const user = await requireUser();
  await generateFollowUpTasks(user.clinicId);
  revalidatePath("/dashboard/follow-ups");
}

export async function sendFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await prisma.followUpTask.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!task || task.status !== "PENDING") return;

  try {
    await sendTextMessage(task.phone, task.message, user.clinicId);
    await prisma.followUpTask.update({ where: { id: task.id }, data: { status: "SENT", sentAt: new Date(), lastAttemptAt: new Date(), attemptCount: { increment: 1 }, errorMessage: null } });
  } catch (error) {
    await prisma.followUpTask.update({ where: { id: task.id }, data: { status: "FAILED", lastAttemptAt: new Date(), attemptCount: { increment: 1 }, errorMessage: error instanceof Error ? error.message : "Unable to send WhatsApp message" } });
  }
  revalidatePath("/dashboard/follow-ups");
}

export async function completeFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const outcome = String(formData.get("outcome") || "OTHER").trim().slice(0, 80);
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "SENT", "FAILED"] } }, data: { status: "COMPLETED", outcome, completedAt: new Date() } });
  revalidatePath("/dashboard/follow-ups");
}

export async function assignFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const assignedUserId = Number(formData.get("assignedUserId")) || null;
  if (!Number.isInteger(id)) return;
  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedUserId, clinicId: user.clinicId, active: true }, select: { id: true } });
    if (!assignee) return;
  }
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, data: { assignedUserId } });
  revalidatePath("/dashboard/follow-ups");
}

export async function snoozeFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const scheduledFor = String(formData.get("scheduledFor") || "");
  if (!Number.isInteger(id) || !scheduledFor) return;
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "FAILED", "SENT"] } }, data: { status: "PENDING", scheduledFor: new Date(scheduledFor), snoozedUntil: new Date(scheduledFor) } });
  revalidatePath("/dashboard/follow-ups");
}

export async function cancelFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "FAILED", "SENT"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  revalidatePath("/dashboard/follow-ups");
}
