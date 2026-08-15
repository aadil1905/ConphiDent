"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PLATFORM_ROLES, platformRoleFor, requirePlatformPermission, type PlatformRole } from "@/lib/platform";

const CLINIC_ROLES = ["OWNER", "ADMINISTRATOR", "DENTIST", "RECEPTIONIST", "BILLING", "ASSISTANT", "INVENTORY", "AUDITOR", "LAB"];

export async function updateClinicUserAction(formData: FormData) {
  const admin = await requirePlatformPermission("user.manage"); const userId = Number(formData.get("userId")); const role = String(formData.get("role") || ""); const active = formData.get("active") === "true";
  if (!Number.isInteger(userId) || !CLINIC_ROLES.includes(role)) return;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, clinicId: true, platformAdmin: true, role: true } });
  // Platform identity must be changed only via the dedicated owner-only action.
  if (!target || target.platformAdmin || target.id === admin.id) return;
  await prisma.$transaction([prisma.user.update({ where: { id: target.id }, data: { role, active } }), ...(active ? [] : [prisma.session.deleteMany({ where: { userId: target.id } })])]);
  await recordAudit({ clinicId: target.clinicId, userId: admin.id, action: "user.updated", entityType: "User", entityId: String(target.id), detail: `Role set to ${role}; account ${active ? "enabled" : "disabled"}` });
  revalidatePath("/platform/users");
}

export async function revokeUserSessionsAction(formData: FormData) {
  const userId = Number(formData.get("userId")); if (!Number.isInteger(userId)) return;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, clinicId: true, platformAdmin: true } }); if (!target) return;
  const admin = await requirePlatformPermission(target.platformAdmin ? "admins.manage" : "user.manage");
  if (target.id === admin.id) return;
  await prisma.session.deleteMany({ where: { userId: target.id } });
  await recordAudit({ clinicId: target.clinicId, userId: admin.id, action: "sessions.revoked", entityType: "User", entityId: String(target.id), detail: "Platform administrator revoked all active sessions" });
  revalidatePath("/platform/users");
}

export async function setPlatformAdminRoleAction(formData: FormData) {
  const admin = await requirePlatformPermission("admins.manage");
  if (platformRoleFor(admin) !== "PLATFORM_OWNER") return;
  const userId = Number(formData.get("userId")); const role = String(formData.get("platformRole") || "") as PlatformRole; const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(userId) || !PLATFORM_ROLES.includes(role) || !["PLATFORM_OWNER", "SUPER_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "BILLING_ADMIN", "TECHNICAL_ADMIN", "READ_ONLY_ADMIN"].includes(role)) return;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, clinicId: true, platformAdmin: true, platformRole: true } }); if (!target) return;
  const owners = await prisma.user.count({ where: { platformAdmin: true, platformRole: "PLATFORM_OWNER", active: true } });
  if (target.platformAdmin && target.platformRole === "PLATFORM_OWNER" && (!enabled || role !== "PLATFORM_OWNER") && owners <= 1) return;
  await prisma.$transaction([prisma.user.update({ where: { id: target.id }, data: { platformAdmin: enabled, platformRole: enabled ? role : null } }), ...(enabled ? [] : [prisma.session.deleteMany({ where: { userId: target.id } })])]);
  await recordAudit({ clinicId: target.clinicId, userId: admin.id, action: enabled ? "admin.role_changed" : "admin.disabled", entityType: "User", entityId: String(target.id), detail: enabled ? `Platform role set to ${role}` : "Platform administration removed and sessions revoked" });
  revalidatePath("/platform/users");
}
