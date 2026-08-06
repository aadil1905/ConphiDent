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
    await prisma.followUpTask.update({ where: { id: task.id }, data: { status: "SENT", sentAt: new Date(), errorMessage: null } });
  } catch (error) {
    await prisma.followUpTask.update({ where: { id: task.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unable to send WhatsApp message" } });
  }
  revalidatePath("/dashboard/follow-ups");
}

export async function completeFollowUpAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  await prisma.followUpTask.updateMany({ where: { id, clinicId: user.clinicId, status: { in: ["PENDING", "SENT", "FAILED"] } }, data: { status: "COMPLETED", completedAt: new Date() } });
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
