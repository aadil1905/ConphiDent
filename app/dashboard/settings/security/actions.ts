"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { issueVerificationCode, normalizePhone, verifyCode } from "@/lib/verification";

export async function requestEmailVerificationAction() {
  const user = await requireUser();
  try {
    await issueVerificationCode({ userId: user.id, recipient: user.email, purpose: "EMAIL_VERIFY", channel: "EMAIL" });
  } catch {
    redirect("/dashboard/settings/security?error=email");
  }
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "EMAIL_VERIFICATION_REQUESTED", entityType: "USER", entityId: String(user.id), detail: "Verification email requested" });
  redirect("/dashboard/settings/security?emailSent=1");
}

export async function verifyEmailAction(formData: FormData) {
  const user = await requireUser();
  const code = String(formData.get("code") || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code) || !(await verifyCode({ userId: user.id, recipient: user.email, purpose: "EMAIL_VERIFY", code }))) redirect("/dashboard/settings/security?error=code");
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "EMAIL_VERIFIED", entityType: "USER", entityId: String(user.id), detail: "Email address verified" });
  revalidatePath("/dashboard/settings/security");
  redirect("/dashboard/settings/security?emailVerified=1");
}

export async function requestPhoneVerificationAction(formData: FormData) {
  const user = await requireUser();
  const phone = normalizePhone(String(formData.get("phone") || ""));
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) redirect("/dashboard/settings/security?error=phone");
  try {
    await issueVerificationCode({ userId: user.id, recipient: phone, purpose: "PHONE_VERIFY", channel: "SMS" });
  } catch {
    redirect("/dashboard/settings/security?error=phoneDelivery");
  }
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "PHONE_VERIFICATION_REQUESTED", entityType: "USER", entityId: String(user.id), detail: "Phone verification requested" });
  redirect("/dashboard/settings/security?phoneSent=1");
}

export async function verifyPhoneAction(formData: FormData) {
  const user = await requireUser();
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const code = String(formData.get("code") || "").replace(/\s/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(code) || !(await verifyCode({ userId: user.id, recipient: phone, purpose: "PHONE_VERIFY", code }))) redirect("/dashboard/settings/security?error=code");
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "PHONE_VERIFIED", entityType: "USER", entityId: String(user.id), detail: "Phone number verified" });
  revalidatePath("/dashboard/settings/security");
  redirect("/dashboard/settings/security?phoneVerified=1");
}
