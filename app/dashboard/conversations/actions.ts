"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { sendTextMessage } from "@/lib/whatsapp";

export async function updateConversationAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  if (!(await hasFeature(user.clinicId, "whatsapp"))) return;
  const id = Number(formData.get("id"));
  const assignedUserId = Number(formData.get("assignedUserId")) || null;
  const status = String(formData.get("status") || "OPEN");
  const submittedAutomationMode = String(formData.get("automationMode") || "");
  const automationMode = submittedAutomationMode || undefined;
  const label = String(formData.get("label") || "").trim() || null;
  if (!Number.isInteger(id) || !["OPEN", "RESOLVED"].includes(status) || (automationMode && !["BOT_ACTIVE", "HUMAN_ACTIVE", "PAUSED"].includes(automationMode))) return;
  if (assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedUserId, clinicId: user.clinicId, active: true }, select: { id: true } });
    if (!assignee) return;
  }
  await prisma.whatsAppConversation.updateMany({ where: { id, clinicId: user.clinicId }, data: { assignedUserId, status, label, ...(automationMode ? { automationMode } : {}) } });
  revalidatePath("/dashboard/conversations");
}

export async function sendConversationMessageAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  if (!(await hasFeature(user.clinicId, "whatsapp"))) return;
  const conversationId = Number(formData.get("conversationId"));
  const content = String(formData.get("content") || "").trim();
  if (!Number.isInteger(conversationId) || !content || content.length > 4096) return;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, clinicId: user.clinicId },
    select: { id: true, phone: true },
  });
  if (!conversation) return;

  await sendTextMessage(conversation.phone, content, user.clinicId);
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), assignedUserId: user.id, status: "OPEN", automationMode: "HUMAN_ACTIVE" },
  });
  revalidatePath("/dashboard/conversations");
}
