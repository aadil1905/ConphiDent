import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const PLATFORM_NAME = process.env.NEXT_PUBLIC_PLATFORM_NAME || "ConPhiDent";

export function slugifyClinic(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function isPlatformAdmin(user: { platformAdmin: boolean; email: string }) {
  const configured = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return user.platformAdmin || configured.includes(user.email.toLowerCase());
}

export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (!user || !isPlatformAdmin(user)) redirect("/dashboard");
  return user;
}

export const tenantFromRequestHost = cache(async () => {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const setupDomain = process.env.SETUP_DOMAIN?.split(":")[0].toLowerCase();
  const platformDomain = process.env.PLATFORM_DOMAIN?.toLowerCase();
  if (!platformDomain || host === setupDomain || host === platformDomain || host === `www.${platformDomain}` || !host.endsWith(`.${platformDomain}`)) return null;
  const slug = host.slice(0, -(platformDomain.length + 1));
  if (!slug || slug === "setup" || slug.includes(".")) return null;
  return prisma.clinic.findUnique({ where: { slug }, select: { id: true, name: true, brandName: true, logoUrl: true, accentColor: true, status: true } });
});
