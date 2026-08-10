import "server-only";

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const normalizePhone = (value: string) => value.replace(/[\s()-]/g, "").replace(/^00/, "+");

async function consumeRateLimit(scope: string, subject: string, max: number, windowMs: number) {
  const subjectHash = digest(subject.toLowerCase());
  const now = new Date();
  const resetAt = new Date(now.getTime() - windowMs);
  const current = await prisma.securityRateLimit.findUnique({ where: { scope_subjectHash: { scope, subjectHash } } });
  if (!current || current.windowStart <= resetAt) {
    await prisma.securityRateLimit.upsert({ where: { scope_subjectHash: { scope, subjectHash } }, create: { scope, subjectHash, windowStart: now, count: 1 }, update: { windowStart: now, count: 1 } });
    return true;
  }
  if (current.count >= max) return false;
  await prisma.securityRateLimit.update({ where: { id: current.id }, data: { count: { increment: 1 } } });
  return true;
}

async function deliverEmailOtp(to: string, code: string, purpose: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Email verification is not configured.");
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: "Your ConphiDent verification code", html: `<p>Your ${purpose.toLowerCase().replaceAll("_", " ")} code is:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. Do not share it with anyone.</p>` }) });
  if (!response.ok) throw new Error("Email provider did not accept the verification message.");
}

/** SMS remains provider-neutral: configure a real provider adapter before enabling phone verification. */
async function deliverSmsOtp(_to: string, _code: string) {
  void _to; void _code;
  if (!process.env.SMS_PROVIDER) throw new Error("Phone verification is not configured.");
  throw new Error("The configured SMS provider adapter has not been implemented.");
}

export async function issueVerificationCode(input: { userId: number; recipient: string; purpose: "EMAIL_VERIFY" | "PHONE_VERIFY"; channel: "EMAIL" | "SMS" }) {
  const recipient = input.channel === "SMS" ? normalizePhone(input.recipient) : input.recipient.trim().toLowerCase();
  const allowed = await consumeRateLimit(`otp:${input.purpose}`, recipient, MAX_PER_HOUR, 60 * 60_000);
  if (!allowed) throw new Error("Too many verification requests. Please wait before trying again.");
  const latest = await prisma.authChallenge.findFirst({ where: { userId: input.userId, purpose: input.purpose, recipient }, orderBy: { createdAt: "desc" } });
  if (latest && latest.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) throw new Error("Please wait before requesting another code.");
  const code = String(randomInt(100000, 1000000));
  await prisma.authChallenge.updateMany({ where: { userId: input.userId, purpose: input.purpose, recipient, consumedAt: null }, data: { consumedAt: new Date() } });
  const challenge = await prisma.authChallenge.create({ data: { userId: input.userId, purpose: input.purpose, channel: input.channel, recipient, codeHash: digest(code), expiresAt: new Date(Date.now() + CODE_TTL_MS), maxAttempts: MAX_ATTEMPTS } });
  try {
    if (input.channel === "EMAIL") await deliverEmailOtp(recipient, code, input.purpose); else await deliverSmsOtp(recipient, code);
  } catch (error) {
    await prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}

export async function verifyCode(input: { userId: number; recipient: string; purpose: "EMAIL_VERIFY" | "PHONE_VERIFY"; code: string }) {
  const recipient = input.purpose === "PHONE_VERIFY" ? normalizePhone(input.recipient) : input.recipient.trim().toLowerCase();
  const challenge = await prisma.authChallenge.findFirst({ where: { userId: input.userId, purpose: input.purpose, recipient, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= challenge.maxAttempts) return false;
  const expected = Buffer.from(challenge.codeHash, "hex"); const received = Buffer.from(digest(input.code), "hex");
  const valid = expected.length === received.length && timingSafeEqual(expected, received);
  if (!valid) { await prisma.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } }); return false; }
  await prisma.$transaction([prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } }), prisma.user.update({ where: { id: input.userId }, data: input.purpose === "EMAIL_VERIFY" ? { emailVerifiedAt: new Date() } : { phone: recipient, phoneVerifiedAt: new Date() } })]);
  return true;
}
