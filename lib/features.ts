import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const FEATURE_REGISTRY = {
  patients: { label: "Patients", defaultEnabled: true },
  appointments: { label: "Appointments", defaultEnabled: true },
  clinical: { label: "Clinical workspace", defaultEnabled: true },
  billing: { label: "Billing", defaultEnabled: true },
  crm: { label: "CRM & leads", defaultEnabled: true },
  follow_ups: { label: "Follow-ups", defaultEnabled: true },
  whatsapp: { label: "WhatsApp", defaultEnabled: true },
  laboratory: { label: "Laboratory", defaultEnabled: true },
  inventory: { label: "Inventory", defaultEnabled: true },
  reports: { label: "Reports", defaultEnabled: true },
  analytics: { label: "Advanced analytics", defaultEnabled: true },
  ai_coach: { label: "AI Coach", defaultEnabled: true },
} as const;

export type FeatureKey = keyof typeof FEATURE_REGISTRY;

export const getFeatureEntitlements = cache(async (clinicId: number) => {
  const overrides = await prisma.tenantFeatureEntitlement.findMany({ where: { clinicId }, select: { featureKey: true, enabled: true } });
  const overrideMap = new Map(overrides.map((item) => [item.featureKey, item.enabled]));
  return Object.fromEntries(Object.entries(FEATURE_REGISTRY).map(([key, feature]) => [key, overrideMap.get(key) ?? feature.defaultEnabled])) as Record<FeatureKey, boolean>;
});

export async function hasFeature(clinicId: number, feature: FeatureKey) {
  return (await getFeatureEntitlements(clinicId))[feature];
}

/** Server-only authorization boundary for feature-gated pages, actions, and APIs. */
export async function requireFeature(feature: FeatureKey) {
  const user = await requireUser();
  if (!(await hasFeature(user.clinicId, feature))) redirect("/dashboard");
  return user;
}
