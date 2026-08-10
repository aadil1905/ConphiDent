import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const PLATFORM_NAME = process.env.NEXT_PUBLIC_PLATFORM_NAME || "ConPhiDent";
export const PLATFORM_ROLES = ["SUPER_ADMIN", "PLATFORM_ADMIN", "SUPPORT", "FINANCE", "WHATSAPP_OPERATIONS", "SALES_ONBOARDING"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type PlatformPermission = "tenant.read" | "tenant.manage" | "whatsapp.read" | "whatsapp.manage" | "subscription.manage" | "support.manage" | "audit.read" | "onboarding.manage";
const PLATFORM_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  SUPER_ADMIN: ["tenant.read", "tenant.manage", "whatsapp.read", "whatsapp.manage", "subscription.manage", "support.manage", "audit.read", "onboarding.manage"],
  PLATFORM_ADMIN: ["tenant.read", "tenant.manage", "whatsapp.read", "whatsapp.manage", "subscription.manage", "support.manage", "audit.read", "onboarding.manage"],
  SUPPORT: ["tenant.read", "support.manage", "audit.read"], FINANCE: ["tenant.read", "subscription.manage", "audit.read"], WHATSAPP_OPERATIONS: ["tenant.read", "whatsapp.read", "whatsapp.manage", "audit.read"], SALES_ONBOARDING: ["tenant.read", "onboarding.manage"],
};

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

/** Legacy platform administrators are intentionally treated as Super Admins until assigned a narrower platformRole. */
export async function requirePlatformPermission(permission: PlatformPermission) {
  const user = await requirePlatformAdmin();
  const role = (PLATFORM_ROLES.includes(user.platformRole as PlatformRole) ? user.platformRole : "SUPER_ADMIN") as PlatformRole;
  if (!PLATFORM_PERMISSIONS[role].includes(permission)) redirect("/setup");
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
