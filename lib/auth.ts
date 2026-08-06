import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { readSessionCookie, signSessionId } from "@/lib/auth-token";
export const SESSION_COOKIE = "dentalai_session";
export const ROLES = ["OWNER", "DENTIST", "RECEPTIONIST"] as const;
export function hashPassword(password: string) { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`; }
export function verifyPassword(password: string, storedHash: string) { const [salt, hash] = storedHash.split(":"); if (!salt || !hash) return false; const stored = Buffer.from(hash, "hex"); const candidate = scryptSync(password, salt, 64); return stored.length === candidate.length && timingSafeEqual(stored, candidate); }
export async function createSession(userId: number, remember = false) { const expiresAt = new Date(Date.now() + (remember ? 30 : 7) * 24 * 60 * 60 * 1000); const id = randomBytes(32).toString("hex"); await prisma.session.create({ data: { id, userId, expiresAt } }); const cookieStore = await cookies(); cookieStore.set(SESSION_COOKIE, await signSessionId(id, expiresAt), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: expiresAt, path: "/" }); }
export async function destroySession() { const store = await cookies(); const parsed = await readSessionCookie(store.get(SESSION_COOKIE)?.value); if (parsed) await prisma.session.delete({ where: { id: parsed.id } }).catch(() => undefined); store.delete(SESSION_COOKIE); }
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
          role: true,
          active: true,
          platformAdmin: true,
          clinic: { select: { id: true, name: true, slug: true, status: true, brandName: true, logoUrl: true, accentColor: true, phone: true, email: true, address: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.active || session.user.clinic.status !== "ACTIVE") return null;
  return session.user;
});
export async function requireUser() { const user = await getCurrentUser(); if (!user) redirect("/login"); return user; }
export async function requireOwner() { const user = await requireUser(); if (user.role !== "OWNER") redirect("/dashboard"); return user; }
