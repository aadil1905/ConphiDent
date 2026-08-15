import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const PLATFORM_NAME =
  process.env.NEXT_PUBLIC_PLATFORM_NAME || "ConPhiDent";
/**
 * Platform roles are intentionally independent of clinic roles.  `platformRole`
 * remains a string while the platform is in this transition, so legacy values
 * stay supported until they are deliberately reassigned.
 */
export const PLATFORM_ROLES = [
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "OPERATIONS_ADMIN",
  "SUPPORT_ADMIN",
  "BILLING_ADMIN",
  "TECHNICAL_ADMIN",
  "READ_ONLY_ADMIN",
  // Legacy role values retained for a non-breaking migration path.
  "PLATFORM_ADMIN",
  "SUPPORT",
  "FINANCE",
  "WHATSAPP_OPERATIONS",
  "SALES_ONBOARDING",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const PLATFORM_PERMISSIONS = [
  "tenant.read",
  "tenant.create",
  "tenant.update",
  "tenant.suspend",
  "user.read",
  "user.manage",
  "whatsapp.read",
  "whatsapp.manage",
  "billing.read",
  "billing.manage",
  "analytics.read",
  "deployment.read",
  "logs.read",
  "settings.manage",
  "admins.manage",
  "support.manage",
  "onboarding.manage",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  PLATFORM_OWNER: PLATFORM_PERMISSIONS,
  SUPER_ADMIN: PLATFORM_PERMISSIONS,
  OPERATIONS_ADMIN: [
    "tenant.read",
    "tenant.update",
    "whatsapp.read",
    "whatsapp.manage",
    "analytics.read",
    "logs.read",
    "support.manage",
    "onboarding.manage",
  ],
  SUPPORT_ADMIN: ["tenant.read", "user.read", "logs.read", "support.manage"],
  BILLING_ADMIN: [
    "tenant.read",
    "billing.read",
    "billing.manage",
    "analytics.read",
    "logs.read",
  ],
  TECHNICAL_ADMIN: [
    "tenant.read",
    "whatsapp.read",
    "deployment.read",
    "logs.read",
  ],
  READ_ONLY_ADMIN: [
    "tenant.read",
    "user.read",
    "whatsapp.read",
    "billing.read",
    "analytics.read",
    "deployment.read",
    "logs.read",
  ],
  PLATFORM_ADMIN: PLATFORM_PERMISSIONS,
  SUPPORT: ["tenant.read", "user.read", "logs.read", "support.manage"],
  FINANCE: [
    "tenant.read",
    "billing.read",
    "billing.manage",
    "analytics.read",
    "logs.read",
  ],
  WHATSAPP_OPERATIONS: [
    "tenant.read",
    "whatsapp.read",
    "whatsapp.manage",
    "logs.read",
  ],
  SALES_ONBOARDING: ["tenant.read", "onboarding.manage"],
};

export function slugifyClinic(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function isPlatformAdmin(user: {
  platformAdmin: boolean;
  email: string;
}) {
  const configured = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return user.platformAdmin || configured.includes(user.email.toLowerCase());
}

export async function requirePlatformAdmin() {
  const user = await getCurrentUser();
  if (user?.mustChangePassword) redirect("/change-password");
  if (!user || !isPlatformAdmin(user)) redirect("/dashboard");
  return user;
}

/** Unknown or unassigned roles fail closed to read-only access. */
export function platformRoleFor(user: {
  platformRole: string | null;
}): PlatformRole {
  return (
    PLATFORM_ROLES.includes(user.platformRole as PlatformRole)
      ? user.platformRole
      : "READ_ONLY_ADMIN"
  ) as PlatformRole;
}

export function hasPlatformPermission(
  user: { platformRole: string | null },
  permission: PlatformPermission,
) {
  const role = platformRoleFor(user);
  return (
    role === "PLATFORM_OWNER" || ROLE_PERMISSIONS[role].includes(permission)
  );
}

export async function requirePlatformPermission(
  permission: PlatformPermission,
) {
  const user = await requirePlatformAdmin();
  if (!hasPlatformPermission(user, permission)) redirect("/setup");
  return user;
}

export const tenantFromRequestHost = cache(async () => {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase() ?? "";
  const setupDomain = process.env.SETUP_DOMAIN?.split(":")[0].toLowerCase();
  const platformDomain = process.env.PLATFORM_DOMAIN?.toLowerCase();
  if (
    !platformDomain ||
    host === setupDomain ||
    host === platformDomain ||
    host === `www.${platformDomain}` ||
    !host.endsWith(`.${platformDomain}`)
  )
    return null;
  const slug = host.slice(0, -(platformDomain.length + 1));
  if (!slug || slug === "setup" || slug.includes(".")) return null;
  return prisma.clinic.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      brandName: true,
      logoUrl: true,
      accentColor: true,
      status: true,
    },
  });
});
