"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { ROLES, hashPassword, requireOwner } from "@/lib/auth";

export async function updateClinicAction(formData: FormData) {
  const owner = await requireOwner();

  await prisma.clinic.update({
    where: { id: owner.clinicId },
    data: {
      name: String(formData.get("name") || "").trim(),
      brandName: String(formData.get("brandName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      email: String(formData.get("email") || "").trim() || null,
      address: String(formData.get("address") || "").trim() || null,
    },
  });

  await recordAudit({
    clinicId: owner.clinicId,
    userId: owner.id,
    action: "CLINIC_PROFILE_UPDATED",
    entityType: "CLINIC",
    entityId: String(owner.clinicId),
    detail: "Updated clinic profile",
  });

  revalidatePath("/dashboard/settings");
}

export async function createStaffAction(formData: FormData) {
  const owner = await requireOwner();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "RECEPTIONIST");

  if (!fullName || !email || password.length < 10 || !ROLES.includes(role as (typeof ROLES)[number])) {
    redirect("/dashboard/settings?error=staff");
  }

  try {
    const staff = await prisma.user.create({
      data: {
        clinicId: owner.clinicId,
        fullName,
        email,
        role,
        passwordHash: hashPassword(password),
      },
    });

    await recordAudit({
      clinicId: owner.clinicId,
      userId: owner.id,
      action: "STAFF_CREATED",
      entityType: "USER",
      entityId: String(staff.id),
      detail: `Created ${staff.fullName} as ${staff.role.toLowerCase()}`,
    });
  } catch {
    redirect("/dashboard/settings?error=staff");
  }

  revalidatePath("/dashboard/settings");
}

export async function toggleStaffAction(formData: FormData) {
  const owner = await requireOwner();
  const userId = Number(formData.get("userId"));
  const active = String(formData.get("active")) === "true";

  if (!Number.isInteger(userId) || userId === owner.id) return;

  const result = await prisma.user.updateMany({
    where: { id: userId, clinicId: owner.clinicId, role: { not: "OWNER" } },
    data: { active },
  });

  if (result.count > 0) {
    await recordAudit({
      clinicId: owner.clinicId,
      userId: owner.id,
      action: active ? "STAFF_ACCESS_ENABLED" : "STAFF_ACCESS_DISABLED",
      entityType: "USER",
      entityId: String(userId),
      detail: active ? "Enabled staff account access" : "Disabled staff account access",
    });
  }

  revalidatePath("/dashboard/settings");
}
