"use server";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";

export async function createInternalNoteAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage"); const clinicId = Number(formData.get("clinicId")); const body = String(formData.get("body") || "").trim().slice(0, 4000); const category = String(formData.get("category") || "GENERAL").slice(0, 50);
  if (!Number.isInteger(clinicId) || !body) return;
  await prisma.platformInternalNote.create({ data: { clinicId, authorId: admin.id, category, body } });
  await recordAudit({ clinicId, userId: admin.id, action: "internal_note.created", entityType: "PlatformInternalNote", detail: `Internal ${category} note created` }); revalidatePath("/platform/operations");
}
export async function createPlatformTaskAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage"); const title = String(formData.get("title") || "").trim().slice(0, 200); const clinicRaw = String(formData.get("clinicId") || ""); const clinicId = clinicRaw ? Number(clinicRaw) : null; const due = String(formData.get("dueAt") || ""); const dueAt = due ? new Date(due) : null; const priority = String(formData.get("priority") || "NORMAL");
  if (!title || (clinicId !== null && !Number.isInteger(clinicId)) || (dueAt && Number.isNaN(dueAt.valueOf())) || !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(priority)) return;
  await prisma.platformTask.create({ data: { clinicId, title, description: String(formData.get("description") || "").trim().slice(0, 3000) || null, priority, dueAt, createdById: admin.id, assigneeId: admin.id } });
  await recordAudit({ clinicId: clinicId || admin.clinicId, userId: admin.id, action: "platform_task.created", entityType: "PlatformTask", detail: title }); revalidatePath("/platform/operations");
}
export async function updatePlatformTaskStatusAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage"); const id = Number(formData.get("id")); const status = String(formData.get("status") || ""); if (!Number.isInteger(id) || !["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"].includes(status)) return;
  const task = await prisma.platformTask.update({ where: { id }, data: { status }, select: { clinicId: true, title: true } }); await recordAudit({ clinicId: task.clinicId || admin.clinicId, userId: admin.id, action: "platform_task.updated", entityType: "PlatformTask", entityId: String(id), detail: `${task.title}: ${status}` }); revalidatePath("/platform/operations");
}
export async function createAnnouncementAction(formData: FormData) {
  const admin = await requirePlatformPermission("settings.manage"); const title = String(formData.get("title") || "").trim().slice(0, 200); const message = String(formData.get("message") || "").trim().slice(0, 4000); const targetType = String(formData.get("targetType") || "ALL_CLINICS"); const targetRaw = String(formData.get("targetClinicId") || ""); const targetClinicId = targetRaw ? Number(targetRaw) : null;
  if (!title || !message || !["ALL_CLINICS", "CLINIC"].includes(targetType) || (targetType === "CLINIC" && !Number.isInteger(targetClinicId))) return;
  await prisma.platformAnnouncement.create({ data: { title, message, targetType, targetClinicId: targetType === "CLINIC" ? targetClinicId : null, severity: String(formData.get("severity") || "INFO"), createdById: admin.id } });
  await recordAudit({ clinicId: targetClinicId || admin.clinicId, userId: admin.id, action: "announcement.created", entityType: "PlatformAnnouncement", detail: title }); revalidatePath("/platform/operations");
}
