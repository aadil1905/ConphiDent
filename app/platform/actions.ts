"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { defaultHours, defaultServices } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, slugifyClinic } from "@/lib/platform";

export async function createClinicAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const name = String(formData.get("name") || "").trim();
  const requestedSlug = String(formData.get("slug") || "").trim();
  const slug = slugifyClinic(requestedSlug || name);
  const ownerName = String(formData.get("ownerName") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!name || !slug || !ownerName || !/^\S+@\S+\.\S+$/.test(ownerEmail) || password.length < 10) redirect("/platform?error=invalid");

  const [takenSlug, takenEmail] = await Promise.all([
    prisma.clinic.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
  ]);
  if (takenSlug || takenEmail) redirect(`/platform?error=${takenSlug ? "slug" : "email"}`);

  const clinic = await prisma.clinic.create({
    data: {
      name,
      brandName: name,
      slug,
      services: { create: defaultServices },
      hours: { create: defaultHours },
      whatsapp: { create: {} },
      launchChecklist: { create: {} },
      users: { create: { fullName: ownerName, email: ownerEmail, role: "OWNER", passwordHash: hashPassword(password) } },
      auditLogs: { create: { action: "CLINIC_PROVISIONED", entityType: "Clinic", detail: `Provisioned by ${admin.email}` } },
    },
  });
  revalidatePath("/platform");
  redirect(`/platform?created=${clinic.slug}`);
}

export async function setClinicStatusAction(formData: FormData) {
  await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(clinicId) || !["ACTIVE", "SUSPENDED"].includes(status)) return;
  await prisma.clinic.update({ where: { id: clinicId }, data: { status } });
  revalidatePath("/platform");
}

/** Creates an additional owner for a clinic that already exists. Never overwrites an account. */
export async function createClinicOwnerAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!Number.isInteger(clinicId) || !fullName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
    redirect("/platform?error=owner-invalid");
  }

  const [clinic, existingUser] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, slug: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (!clinic) redirect("/platform?error=owner-clinic");
  if (existingUser) redirect("/platform?error=owner-email");

  const owner = await prisma.user.create({
    data: { clinicId, fullName, email, role: "OWNER", passwordHash: hashPassword(password) },
  });
  await recordAudit({
    clinicId,
    userId: admin.id,
    action: "CLINIC_OWNER_CREATED",
    entityType: "User",
    entityId: String(owner.id),
    detail: `Owner login created by ${admin.email}`,
  });
  revalidatePath("/platform");
  redirect(`/platform?ownerCreated=${encodeURIComponent(clinic.slug || String(clinic.id))}`);
}
