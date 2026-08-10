"use server";

import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { consumeSecurityRateLimit, createSession, destroyAllSessions, hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PLATFORM_NAME } from "@/lib/platform";

const resetUrlBase = (process.env.NEXT_PUBLIC_APP_URL || "https://conphident.live").replace(/\/$/, "");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function sendResetEmail(email: string, url: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email not configured");
  const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: `Reset your ${PLATFORM_NAME} password`, html: `<p>Use this secure link to reset your password. It expires in 30 minutes.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>` }) });
  if (!result.ok) throw new Error("Email failed");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const allowed = email && await consumeSecurityRateLimit("login", email, 20, 15 * 60 * 1000);
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  const locked = user?.lockedUntil && user.lockedUntil > new Date();
  if (!allowed || !user || !user.active || locked || !verifyPassword(password, user.passwordHash)) {
    if (user && user.active && !locked) {
      const failed = await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: { increment: 1 } }, select: { failedLoginCount: true } });
      if (failed.failedLoginCount >= 5) {
        await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });
        await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_LOCKED", entityType: "USER", entityId: String(user.id), detail: "Account temporarily locked after repeated failed sign-in attempts" });
      }
    }
    redirect("/login?error=invalid");
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, formData.get("remember") === "on");
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "LOGIN_SUCCEEDED", entityType: "SESSION", detail: "Password sign-in succeeded" });
  redirect("/dashboard");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, active: true, email: true } }) : null;
  if (user?.active && await consumeSecurityRateLimit("password-reset", user.email, 5, 60 * 60 * 1000)) { const token = randomBytes(32).toString("base64url"); const tokenHash = digest(token); await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }); await prisma.passwordResetToken.create({ data: { id: randomBytes(20).toString("hex"), userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }); try { await sendResetEmail(user.email, `${resetUrlBase}/reset-password?token=${encodeURIComponent(token)}`); } catch { await prisma.passwordResetToken.deleteMany({ where: { tokenHash } }); } }
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || ""); const password = String(formData.get("password") || ""); const confirm = String(formData.get("confirmPassword") || "");
  if (!token || passwordPolicyError(password) || password !== confirm) redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: digest(token) }, select: { id: true, userId: true, expiresAt: true } });
  if (!reset || reset.expiresAt <= new Date()) { if (reset) await prisma.passwordResetToken.delete({ where: { id: reset.id } }); redirect("/forgot-password?expired=1"); }
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: hashPassword(password) }, select: { id: true, clinicId: true } });
    await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    return user;
  });
  await recordAudit({ clinicId: updated.clinicId, userId: updated.id, action: "PASSWORD_RESET_COMPLETED", entityType: "USER", entityId: String(updated.id), detail: "Password reset completed; all sessions revoked" });
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData) {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record || !verifyPassword(currentPassword, record.passwordHash) || passwordPolicyError(password) || password !== confirm) redirect("/dashboard/settings/security?error=password");
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } }), prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }), prisma.session.deleteMany({ where: { userId: user.id } })]);
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "PASSWORD_CHANGED", entityType: "USER", entityId: String(user.id), detail: "Password changed; all sessions revoked" });
  await createSession(user.id);
  redirect("/dashboard/settings/security?changed=1");
}

export async function logoutAllDevicesAction() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();
  await destroyAllSessions(user.id);
  await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "SESSIONS_REVOKED", entityType: "SESSION", detail: "User signed out from all devices" });
  redirect("/login?loggedout=1");
}
