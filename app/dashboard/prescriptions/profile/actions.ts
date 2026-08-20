"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, max: number) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

export async function updatePrescriberProfileAction(formData: FormData) {
  const user = await requireFeature("clinical");
  const fullName = value(formData, "fullName", 120);
  const registrationNumber = value(formData, "registrationNumber", 100);
  const qualification = value(formData, "qualification", 160);
  const signatureLabel = value(formData, "signatureLabel", 240);
  if (fullName.length < 2 || registrationNumber.length < 2) {
    redirect("/dashboard/prescriptions/profile?error=required");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { fullName, registrationNumber, qualification: qualification || null, signatureLabel: signatureLabel || null } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PRESCRIBER_PROFILE_UPDATED", entityType: "USER", entityId: String(user.id), detail: "Updated own prescription issuer identity", source: "PRESCRIPTION" } }),
  ]);
  revalidatePath("/dashboard/prescriptions/profile");
  revalidatePath("/dashboard/prescriptions/new");
  redirect("/dashboard/prescriptions/profile?saved=1");
}
