import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { readSessionCookie, signSessionId } from "@/lib/auth-token";
export const SESSION_COOKIE = "dentalai_session";
export const ROLES = [
  "OWNER",
  "ADMINISTRATOR",
  "DENTIST",
  "RECEPTIONIST",
  "BILLING",
  "ASSISTANT",
  "INVENTORY",
  "LAB",
] as const;
export const PASSWORD_MIN_LENGTH = 12;

/** A deliberately boring policy that works with the existing scrypt password store. */
export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  )
    return "Use upper- and lower-case letters plus a number.";
  return null;
}
/** Durable, hashed-subject throttle for authentication flows. */
export async function consumeSecurityRateLimit(
  scope: string,
  subject: string,
  max: number,
  windowMs: number,
) {
  const subjectHash = createHash("sha256")
    .update(subject.trim().toLowerCase())
    .digest("hex");
  const now = new Date();
  const resetAt = new Date(now.getTime() - windowMs);
  const current = await prisma.securityRateLimit.findUnique({
    where: { scope_subjectHash: { scope, subjectHash } },
  });
  if (!current || current.windowStart <= resetAt) {
    await prisma.securityRateLimit.upsert({
      where: { scope_subjectHash: { scope, subjectHash } },
      create: { scope, subjectHash, windowStart: now, count: 1 },
      update: { windowStart: now, count: 1 },
    });
    return true;
  }
  if (current.count >= max) return false;
  await prisma.securityRateLimit.update({
    where: { id: current.id },
    data: { count: { increment: 1 } },
  });
  return true;
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const stored = Buffer.from(hash, "hex");
  const candidate = scryptSync(password, salt, 64);
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}
export async function createSession(userId: number, remember = false) {
  const expiresAt = new Date(
    Date.now() + (remember ? 30 : 7) * 24 * 60 * 60 * 1000,
  );
  const id = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { id, userId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await signSessionId(id, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // `expiresAt` above is the server-side lifetime — enforced regardless via
    // the signed timestamp `readSessionCookie` checks and the DB row's own
    // `expiresAt` — but the cookie's OWN persistence is what "Keep me signed
    // in on this device" actually promises. Setting `expires` unconditionally
    // made every login a 30-day-or-7-day cookie that survives closing the
    // browser either way, so unchecking the box never logged anyone out and
    // checking it never changed anything a person could observe: the box had
    // no effect. Only a `remember`-ed session gets a persistent cookie; an
    // unremembered one is a true session cookie the browser drops on close.
    ...(remember ? { expires: expiresAt } : {}),
    path: "/",
  });
}
export async function destroySession() {
  const store = await cookies();
  const parsed = await readSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (parsed)
    await prisma.session
      .delete({ where: { id: parsed.id } })
      .catch(() => undefined);
  store.delete(SESSION_COOKIE);
}
export async function destroyAllSessions(userId: number) {
  const store = await cookies();
  await prisma.session.deleteMany({ where: { userId } });
  store.delete(SESSION_COOKIE);
}
export const getCurrentUser = cache(async () => {
  const store = await cookies();
  const parsed = await readSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;

  const session = await prisma.session.findUnique({
    where: { id: parsed.id },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          clinicId: true,
          fullName: true,
          email: true,
          mustChangePassword: true,
          emailVerifiedAt: true,
          phone: true,
          qualification: true,
          registrationNumber: true,
          signatureLabel: true,
          phoneVerifiedAt: true,
          role: true,
          active: true,
          platformAdmin: true,
          platformRole: true,
          clinic: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              brandName: true,
              logoUrl: true,
              accentColor: true,
              letterheadPrefix: true,
              letterheadName: true,
              tagline: true,
              principalName: true,
              principalCredentials: true,
              phone: true,
              email: true,
              address: true,
              registrationNumber: true,
              gstin: true,
              receiptPrefix: true,
              invoicePrefix: true,
            },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.active ||
    session.user.clinic.status !== "ACTIVE"
  ) {
    if (session?.expiresAt && session.expiresAt <= new Date())
      await prisma.session
        .delete({ where: { id: parsed.id } })
        .catch(() => undefined);
    return null;
  }
  return session.user;
});
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}
export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/dashboard");
  return user;
}
