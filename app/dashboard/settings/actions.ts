"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { ROLES, hashPassword, passwordPolicyError, requireOwner } from "@/lib/auth";
import { normalizeInvoicePrefix } from "@/lib/invoice-number";
import { requireFeature } from "@/lib/features";

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

const trimmed = (formData: FormData, key: string, max: number) =>
  String(formData.get(key) || "").trim().slice(0, max) || null;

/**
 * The masthead on every printed sheet.
 *
 * Kept apart from the clinic profile above because these five are typography,
 * not contact details: the possessive above the name, the name as it is set on
 * paper, the descriptor under it, and the principal dentist's block opposite.
 * Until this existed the only way they were ever set was a hardcoded backfill
 * in one migration, so a second clinic printed a pad with no doctor on it.
 */
export async function updateLetterheadAction(formData: FormData) {
  const owner = await requireOwner();

  await prisma.clinic.update({
    where: { id: owner.clinicId },
    data: {
      letterheadPrefix: trimmed(formData, "letterheadPrefix", 120),
      letterheadName: trimmed(formData, "letterheadName", 120),
      tagline: trimmed(formData, "tagline", 160),
      principalName: trimmed(formData, "principalName", 120),
      // One qualification per line; the letterhead prints them stacked.
      principalCredentials: trimmed(formData, "principalCredentials", 300),
    },
  });

  await recordAudit({
    clinicId: owner.clinicId,
    userId: owner.id,
    action: "CLINIC_LETTERHEAD_UPDATED",
    entityType: "CLINIC",
    entityId: String(owner.clinicId),
    detail: "Updated the printed letterhead",
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/stationery");
}

export type BillingIdentityResult = { ok: boolean; message: string };

/** 15 characters, exactly as the registration certificate prints them. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

export async function updateBillingIdentityAction(
  _previous: BillingIdentityResult,
  formData: FormData,
): Promise<BillingIdentityResult> {
  const owner = await requireFeature("billing");
  const invoicePrefix = normalizeInvoicePrefix(String(formData.get("invoicePrefix") || "INV"));
  const receiptPrefix = String(formData.get("receiptPrefix") || "RCT").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "RCT";
  const gstin = String(formData.get("gstin") || "").replace(/\s/g, "").trim().toUpperCase();

  // A wrong GSTIN prints onto every bill from here on, so it is worth stopping.
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    return { ok: false, message: "That GSTIN is not 15 characters — copy it from your certificate. Nothing was saved." };
  }
  if (invoicePrefix.length < 2) {
    return { ok: false, message: "The invoice prefix needs at least two letters or numbers. Nothing was saved." };
  }

  await prisma.clinic.update({ where: { id: owner.clinicId }, data: { gstin: gstin || null, registrationNumber: String(formData.get("registrationNumber") || "").trim() || null, invoicePrefix, receiptPrefix, invoiceFooter: String(formData.get("invoiceFooter") || "").trim().slice(0, 500) || null, paymentDetails: String(formData.get("paymentDetails") || "").trim().slice(0, 1500) || null } });
  await recordAudit({ clinicId: owner.clinicId, userId: owner.id, action: "BILLING_IDENTITY_UPDATED", entityType: "CLINIC", entityId: String(owner.clinicId), detail: "Updated billing identity and document footer" });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/billing/new");
  return { ok: true, message: `Saved. Bills from ${invoicePrefix} onwards use this.` };
}

export async function createStaffAction(formData: FormData) {
  const owner = await requireOwner();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "RECEPTIONIST");

  if (!fullName || !email || passwordPolicyError(password) || !ROLES.includes(role as (typeof ROLES)[number])) {
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
        // The password the owner types is a way in, not their password. Login
        // sends them to /change-password before anything else, the same way a
        // platform-created login already works.
        mustChangePassword: true,
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

  if (!Number.isInteger(userId)) return;
  // Locking yourself out is the one thing this page must not let you do, and
  // saying so beats a button that appears to do nothing.
  if (userId === owner.id) redirect("/dashboard/settings?error=self");

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
