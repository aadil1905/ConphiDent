"use server";

import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  consumeSecurityRateLimit,
  createSession,
  destroyAllSessions,
  getCurrentUser,
  hashPassword,
  passwordPolicyError,
  verifyPassword,
} from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PLATFORM_NAME } from "@/lib/platform";

const resetUrlBase = (
  process.env.NEXT_PUBLIC_APP_URL || "https://conphident.live"
).replace(/\/$/, "");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function sendResetEmail(email: string, url: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
    throw new Error("Email not configured");
  const result = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: `Reset your ${PLATFORM_NAME} password`,
      html: `<p>Use this secure link to reset your password. It expires in 30 minutes.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!result.ok) throw new Error("Email failed");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const allowed =
    email &&
    (await consumeSecurityRateLimit("login", email, 20, 15 * 60 * 1000));
  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        include: { clinic: { select: { status: true } } },
      })
    : null;
  const locked = user?.lockedUntil && user.lockedUntil > new Date();
  if (
    !allowed ||
    !user ||
    !user.active ||
    user.clinic.status !== "ACTIVE" ||
    locked ||
    !verifyPassword(password, user.passwordHash)
  ) {
    if (user && user.active && user.clinic.status === "ACTIVE" && !locked) {
      // `clinicId` is carried on every write below, not for filtering — the id
      // already identifies the row — but because lib/tenant-guard.ts refuses an
      // `update` that cannot name a clinic. It exempts `findUnique` on the
      // grounds that a unique filter cannot express one; `update` was never
      // given the same exemption, so these three writes threw under
      // TENANT_GUARD_MODE=enforce and took sign-in down with them.
      const failed = await prisma.user.update({
        where: { id: user.id, clinicId: user.clinicId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      if (failed.failedLoginCount >= 5) {
        await prisma.user.update({
          where: { id: user.id, clinicId: user.clinicId },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        await recordAudit({
          clinicId: user.clinicId,
          userId: user.id,
          action: "LOGIN_LOCKED",
          entityType: "USER",
          entityId: String(user.id),
          detail:
            "Account temporarily locked after repeated failed sign-in attempts",
        });
      }
    }
    redirect("/login?error=invalid");
  }
  await prisma.user.update({
    where: { id: user.id, clinicId: user.clinicId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id, formData.get("remember") === "on");
  await recordAudit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "LOGIN_SUCCEEDED",
    entityType: "SESSION",
    detail: "Password sign-in succeeded",
  });
  if (user.mustChangePassword) redirect("/change-password");
  redirect("/dashboard");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, active: true, email: true },
      })
    : null;
  if (
    user?.active &&
    (await consumeSecurityRateLimit(
      "password-reset",
      user.email,
      5,
      60 * 60 * 1000,
    ))
  ) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = digest(token);
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: {
        id: randomBytes(20).toString("hex"),
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    try {
      await sendResetEmail(
        user.email,
        `${resetUrlBase}/reset-password?token=${encodeURIComponent(token)}`,
      );
    } catch {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    }
  }
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  if (!token || passwordPolicyError(password) || password !== confirm)
    redirect(
      `/reset-password?token=${encodeURIComponent(token)}&error=invalid`,
    );
  const tokenHash = digest(token);
  const passwordHash = hashPassword(password);
  let updated: { id: number; clinicId: number } | null;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true },
      });
      if (!reset) return null;
      if (reset.expiresAt <= now) {
        await tx.passwordResetToken.deleteMany({ where: { id: reset.id, expiresAt: { lte: now } } });
        return null;
      }
      const claim = await tx.passwordResetToken.deleteMany({
        where: { id: reset.id, tokenHash, expiresAt: { gt: now } },
      });
      if (claim.count !== 1) return null;
      // The token identifies the user but says nothing about their clinic, so
      // unlike the sign-in writes above there is no clinicId in scope to carry.
      // `findUnique` is the one action the tenant guard exempts, so reading the
      // clinic first is what lets the update name one. Inside the same
      // Serializable transaction, so it cannot race the write it scopes.
      const owner = await tx.user.findUnique({
        where: { id: reset.userId },
        select: { clinicId: true },
      });
      if (!owner) return null;
      const user = await tx.user.update({
        where: { id: reset.userId, clinicId: owner.clinicId },
        data: { passwordHash, mustChangePassword: false },
        select: { id: true, clinicId: true },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      await tx.auditLog.create({
        data: {
          clinicId: user.clinicId,
          userId: user.id,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "USER",
          entityId: String(user.id),
          detail: "Password reset completed; all sessions revoked",
        },
      });
      return user;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      redirect("/forgot-password?expired=1");
    }
    throw error;
  }
  if (!updated) redirect("/forgot-password?expired=1");
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requiredChange = user.mustChangePassword;
  const currentPassword = String(formData.get("currentPassword") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirmPassword") || "");
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (
    !record ||
    !verifyPassword(currentPassword, record.passwordHash) ||
    passwordPolicyError(password) ||
    password !== confirm
  )
    redirect(
      requiredChange
        ? "/change-password?error=password"
        : "/dashboard/settings/security?error=password",
    );
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id, clinicId: user.clinicId },
      data: { passwordHash: hashPassword(password), mustChangePassword: false },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await recordAudit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "USER",
    entityId: String(user.id),
    detail: "Password changed; all sessions revoked",
  });
  await createSession(user.id);
  redirect(
    requiredChange ? "/dashboard" : "/dashboard/settings/security?changed=1",
  );
}

export async function logoutAllDevicesAction() {
  const { requireUser } = await import("@/lib/auth");
  const user = await requireUser();
  await destroyAllSessions(user.id);
  await recordAudit({
    clinicId: user.clinicId,
    userId: user.id,
    action: "SESSIONS_REVOKED",
    entityType: "SESSION",
    detail: "User signed out from all devices",
  });
  redirect("/login?loggedout=1");
}
