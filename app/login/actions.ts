"use server";

import { createHash, randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLATFORM_NAME } from "@/lib/platform";

const resetUrlBase = (process.env.NEXT_PUBLIC_APP_URL || "https://conphident.live").replace(/\/$/, "");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function sendResetEmail(email: string, url: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email not configured");
  const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: `Reset your ${PLATFORM_NAME} password`, html: `<p>Use this secure link to reset your password. It expires in 30 minutes.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>` }) });
  if (!result.ok) throw new Error("Email failed");
}

export async function loginAction(formData: FormData) { const email = String(formData.get("email") || "").trim().toLowerCase(); const password = String(formData.get("password") || ""); const user = await prisma.user.findUnique({ where: { email } }); if (!user || !user.active || !verifyPassword(password, user.passwordHash)) redirect("/login?error=invalid"); await createSession(user.id, formData.get("remember") === "on"); redirect("/dashboard"); }

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, active: true, email: true } }) : null;
  if (user?.active) { const token = randomBytes(32).toString("base64url"); const tokenHash = digest(token); await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }); await prisma.passwordResetToken.create({ data: { id: randomBytes(20).toString("hex"), userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }); try { await sendResetEmail(user.email, `${resetUrlBase}/reset-password?token=${encodeURIComponent(token)}`); } catch { await prisma.passwordResetToken.deleteMany({ where: { tokenHash } }); } }
  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") || ""); const password = String(formData.get("password") || ""); const confirm = String(formData.get("confirmPassword") || "");
  if (!token || password.length < 10 || password !== confirm) redirect(`/reset-password?token=${encodeURIComponent(token)}&error=invalid`);
  const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash: digest(token) }, select: { id: true, userId: true, expiresAt: true } });
  if (!reset || reset.expiresAt <= new Date()) { if (reset) await prisma.passwordResetToken.delete({ where: { id: reset.id } }); redirect("/forgot-password?expired=1"); }
  await prisma.$transaction([prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: hashPassword(password) } }), prisma.passwordResetToken.deleteMany({ where: { userId: reset.userId } }), prisma.session.deleteMany({ where: { userId: reset.userId } })]); redirect("/login?reset=1");
}
