"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, slugifyClinic } from "@/lib/platform";
import { FEATURE_REGISTRY, type FeatureKey } from "@/lib/features";

function value(formData: FormData, name: string, limit = 500) { return String(formData.get(name) || "").trim().slice(0, limit) || null; }
function validTime(value: string | null) { return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)); }

export async function updatePlatformClinicProfileAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const name = value(formData, "name", 120);
  const slugSource = value(formData, "slug", 80);
  const accentColor = value(formData, "accentColor", 7);
  if (!Number.isInteger(clinicId) || !name || !slugSource || !accentColor || !/^#[0-9a-fA-F]{6}$/.test(accentColor)) return;
  const slug = slugifyClinic(slugSource);
  const existing = await prisma.clinic.findFirst({ where: { slug, NOT: { id: clinicId } }, select: { id: true } });
  if (existing) return;
  await prisma.clinic.update({ where: { id: clinicId }, data: { name, slug, accentColor, brandName: value(formData, "brandName", 120), phone: value(formData, "phone", 50), email: value(formData, "email", 254), address: value(formData, "address", 1000), gstin: value(formData, "gstin", 20), registrationNumber: value(formData, "registrationNumber", 100) } });
  await recordAudit({ clinicId, userId: admin.id, action: "PLATFORM_CLINIC_PROFILE_UPDATED", entityType: "Clinic", entityId: String(clinicId), detail: "Updated by platform control portal" });
  revalidatePath(`/platform/clinics/${clinicId}`); revalidatePath("/platform");
}

export async function savePlatformHoursAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId")); const dayOfWeek = Number(formData.get("dayOfWeek")); const openTime = value(formData, "openTime", 5); const closeTime = value(formData, "closeTime", 5); const slotMinutes = Number(formData.get("slotMinutes")); const isClosed = formData.get("isClosed") === "true";
  if (!Number.isInteger(clinicId) || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240 || !validTime(openTime) || !validTime(closeTime) || (!isClosed && openTime! >= closeTime!)) return;
  await prisma.clinicHours.upsert({ where: { clinicId_dayOfWeek: { clinicId, dayOfWeek } }, update: { openTime: openTime!, closeTime: closeTime!, slotMinutes, isClosed }, create: { clinicId, dayOfWeek, openTime: openTime!, closeTime: closeTime!, slotMinutes, isClosed } });
  await recordAudit({ clinicId, userId: admin.id, action: "PLATFORM_CLINIC_HOURS_UPDATED", entityType: "ClinicHours", entityId: String(dayOfWeek), detail: `Updated ${dayOfWeek} schedule from platform control portal` });
  revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function createLocationAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const name = value(formData, "name", 120);
  if (!Number.isInteger(clinicId) || !name) return;
  const existing = await prisma.clinicLocation.count({ where: { clinicId } });
  await prisma.clinicLocation.create({ data: { clinicId, name, address: value(formData, "address", 1000), phone: value(formData, "phone", 50), email: value(formData, "email", 254), timezone: value(formData, "timezone", 80), isPrimary: existing === 0 } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_CREATED", entityType: "ClinicLocation", detail: `Created location ${name}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function updateLocationAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId")); const name = value(formData, "name", 120);
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId) || !name) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true } }); if (!location) return;
  await prisma.clinicLocation.update({ where: { id: locationId }, data: { name, address: value(formData, "address", 1000), phone: value(formData, "phone", 50), email: value(formData, "email", 254), timezone: value(formData, "timezone", 80) } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_UPDATED", entityType: "ClinicLocation", entityId: String(locationId), detail: `Updated location ${name}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function deactivateLocationAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true, isPrimary: true } });
  if (!location || location.isPrimary) return;
  await prisma.clinicLocation.update({ where: { id: locationId }, data: { active: false } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_DEACTIVATED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Branch deactivated" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function saveLocationHoursAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId")); const dayOfWeek = Number(formData.get("dayOfWeek")); const openTime = value(formData, "openTime", 5); const closeTime = value(formData, "closeTime", 5); const slotMinutes = Number(formData.get("slotMinutes")); const isClosed = formData.get("isClosed") === "true";
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId) || dayOfWeek < 0 || dayOfWeek > 6 || !Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240 || !validTime(openTime) || !validTime(closeTime) || (!isClosed && openTime! >= closeTime!)) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true } }); if (!location) return;
  await prisma.clinicLocationHours.upsert({ where: { locationId_dayOfWeek_sortOrder: { locationId, dayOfWeek, sortOrder: 0 } }, create: { locationId, dayOfWeek, openTime: openTime!, closeTime: closeTime!, slotMinutes, isClosed }, update: { openTime: openTime!, closeTime: closeTime!, slotMinutes, isClosed } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_HOURS_UPDATED", entityType: "ClinicLocationHours", entityId: String(locationId), detail: `Updated branch schedule for day ${dayOfWeek}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function saveLocationAssignmentsAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  const ids = (key: string) => formData.getAll(key).map(Number).filter(Number.isInteger);
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const [location, providers, services] = await Promise.all([prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true } }), prisma.clinicProvider.findMany({ where: { clinicId, id: { in: ids("providerIds") } }, select: { id: true } }), prisma.clinicService.findMany({ where: { clinicId, id: { in: ids("serviceIds") } }, select: { id: true } })]);
  if (!location) return;
  await prisma.$transaction([prisma.clinicLocationProvider.deleteMany({ where: { locationId } }), prisma.clinicLocationService.deleteMany({ where: { locationId } }), prisma.clinicLocationProvider.createMany({ data: providers.map((provider) => ({ locationId, providerId: provider.id })), skipDuplicates: true }), prisma.clinicLocationService.createMany({ data: services.map((service) => ({ locationId, serviceId: service.id })), skipDuplicates: true })]);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_ASSIGNMENTS_UPDATED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Updated branch providers and services" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function setPrimaryLocationAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId, active: true }, select: { id: true } }); if (!location) return;
  await prisma.$transaction([prisma.clinicLocation.updateMany({ where: { clinicId }, data: { isPrimary: false } }), prisma.clinicLocation.update({ where: { id: locationId }, data: { isPrimary: true } })]);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_PRIMARY_LOCATION_CHANGED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Primary location changed" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function saveSubscriptionAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const status = String(formData.get("status") || ""); const billingCycle = String(formData.get("billingCycle") || ""); const priceInput = String(formData.get("price") || ""); const price = priceInput ? Number(priceInput) : null;
  if (!Number.isInteger(clinicId) || !["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"].includes(status) || !["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"].includes(billingCycle) || (price !== null && (!Number.isInteger(price) || price < 0))) return;
  const planIdInput = String(formData.get("planId") || ""); const planId = planIdInput ? Number(planIdInput) : null;
  if (planId !== null && (!Number.isInteger(planId) || !await prisma.subscriptionPlan.findFirst({ where: { id: planId, active: true }, select: { id: true } }))) return;
  await prisma.tenantSubscription.upsert({ where: { clinicId }, create: { clinicId, planId, status, billingCycle, price, internalNotes: value(formData, "internalNotes", 2000) }, update: { planId, status, billingCycle, price, internalNotes: value(formData, "internalNotes", 2000), cancelledAt: status === "CANCELLED" ? new Date() : null } });
  await recordAudit({ clinicId, userId: admin.id, action: "TENANT_SUBSCRIPTION_UPDATED", entityType: "TenantSubscription", detail: `Subscription set to ${status}` }); revalidatePath(`/platform/clinics/${clinicId}`); revalidatePath("/platform");
}

export async function setFeatureEntitlementAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const clinicId = Number(formData.get("clinicId")); const featureKey = String(formData.get("featureKey") || "") as FeatureKey; const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(clinicId) || !(featureKey in FEATURE_REGISTRY)) return;
  await prisma.tenantFeatureEntitlement.upsert({ where: { clinicId_featureKey: { clinicId, featureKey } }, create: { clinicId, featureKey, enabled }, update: { enabled, source: "PLATFORM_OVERRIDE" } });
  await recordAudit({ clinicId, userId: admin.id, action: "TENANT_FEATURE_UPDATED", entityType: "TenantFeatureEntitlement", entityId: featureKey, detail: `${featureKey} ${enabled ? "enabled" : "disabled"}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}
