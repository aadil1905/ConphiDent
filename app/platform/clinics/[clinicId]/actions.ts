"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, slugifyClinic } from "@/lib/platform";
import { FEATURE_REGISTRY, type FeatureKey } from "@/lib/features";

function value(formData: FormData, name: string, limit = 500) { return String(formData.get(name) || "").trim().slice(0, limit) || null; }

function scheduleInput(formData: FormData) {
  const dayValue = String(formData.get("dayOfWeek") ?? "").trim();
  const openTime = String(formData.get("openTime") ?? "").trim();
  const closeTime = String(formData.get("closeTime") ?? "").trim();
  const slotValue = String(formData.get("slotMinutes") ?? "").trim();
  const dayOfWeek = Number(dayValue);
  const slotMinutes = Number(slotValue);
  const isClosed = formData.get("isClosed") === "true";
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (
    !/^\d+$/.test(dayValue)
    || !Number.isInteger(dayOfWeek)
    || dayOfWeek < 0
    || dayOfWeek > 6
    || !validTime.test(openTime)
    || !validTime.test(closeTime)
    || !/^\d+$/.test(slotValue)
    || !Number.isInteger(slotMinutes)
    || slotMinutes < 15
    || slotMinutes > 240
    || (!isClosed && openTime >= closeTime)
  ) return null;

  return { dayOfWeek, openTime, closeTime, slotMinutes, isClosed };
}

export async function savePlatformProviderAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const providerId = Number(formData.get("providerId")); const name = value(formData, "name", 120);
  if (!Number.isInteger(clinicId) || !name) return;
  const duplicate = await prisma.clinicProvider.findFirst({ where: { clinicId, name, ...(Number.isInteger(providerId) ? { NOT: { id: providerId } } : {}) }, select: { id: true } }); if (duplicate) return;
  if (Number.isInteger(providerId)) { const result = await prisma.clinicProvider.updateMany({ where: { id: providerId, clinicId }, data: { name } }); if (!result.count) return; await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_PROVIDER_UPDATED", entityType: "ClinicProvider", entityId: String(providerId), detail: `Provider ${name} saved from Control Centre` }); }
  else { const provider = await prisma.clinicProvider.create({ data: { clinicId, name } }); await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_PROVIDER_CREATED", entityType: "ClinicProvider", entityId: String(provider.id), detail: `Provider ${name} saved from Control Centre` }); }
  revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function setPlatformProviderActiveAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const providerId = Number(formData.get("providerId")); const active = formData.get("active") === "true";
  if (!Number.isInteger(clinicId) || !Number.isInteger(providerId)) return;
  const result = await prisma.clinicProvider.updateMany({ where: { id: providerId, clinicId }, data: { active } }); if (!result.count) return;
  await recordAudit({ clinicId, userId: admin.id, action: active ? "CLINIC_PROVIDER_ACTIVATED" : "CLINIC_PROVIDER_DEACTIVATED", entityType: "ClinicProvider", entityId: String(providerId), detail: `Provider ${active ? "activated" : "deactivated"} from Control Centre` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function savePlatformServiceAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const serviceId = Number(formData.get("serviceId")); const name = value(formData, "name", 120); const durationMinutes = Number(formData.get("durationMinutes")); const priceText = String(formData.get("price") || ""); const price = priceText ? Number(priceText) : null;
  if (!Number.isInteger(clinicId) || !name || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480 || (price !== null && (!Number.isInteger(price) || price < 0))) return;
  const duplicate = await prisma.clinicService.findFirst({ where: { clinicId, name, ...(Number.isInteger(serviceId) ? { NOT: { id: serviceId } } : {}) }, select: { id: true } }); if (duplicate) return;
  const data = { name, description: value(formData, "description", 1000), durationMinutes, price };
  if (Number.isInteger(serviceId)) { const result = await prisma.clinicService.updateMany({ where: { id: serviceId, clinicId }, data }); if (!result.count) return; await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_SERVICE_UPDATED", entityType: "ClinicService", entityId: String(serviceId), detail: `Service ${name} saved from Control Centre` }); }
  else { const service = await prisma.clinicService.create({ data: { clinicId, ...data } }); await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_SERVICE_CREATED", entityType: "ClinicService", entityId: String(service.id), detail: `Service ${name} saved from Control Centre` }); }
  revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function setPlatformServiceActiveAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const serviceId = Number(formData.get("serviceId")); const active = formData.get("active") === "true";
  if (!Number.isInteger(clinicId) || !Number.isInteger(serviceId)) return;
  const result = await prisma.clinicService.updateMany({ where: { id: serviceId, clinicId }, data: { active } }); if (!result.count) return;
  await recordAudit({ clinicId, userId: admin.id, action: active ? "CLINIC_SERVICE_ACTIVATED" : "CLINIC_SERVICE_DEACTIVATED", entityType: "ClinicService", entityId: String(serviceId), detail: `Service ${active ? "activated" : "deactivated"} from Control Centre` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function updatePlatformClinicProfileAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update");
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
  const admin = await requirePlatformPermission("tenant.update");
  const clinicId = Number(formData.get("clinicId"));
  const schedule = scheduleInput(formData);
  if (!Number.isInteger(clinicId) || clinicId <= 0 || !schedule) return;

  await prisma.$transaction(async (tx) => {
    const primaryLocation = await tx.clinicLocation.findFirst({
      where: { clinicId, active: true, isPrimary: true },
      select: { id: true },
    });
    if (!primaryLocation) {
      throw new Error("No active primary branch is configured for booking.");
    }

    await tx.clinicHours.upsert({
      where: { clinicId_dayOfWeek: { clinicId, dayOfWeek: schedule.dayOfWeek } },
      update: schedule,
      create: { clinicId, ...schedule },
    });
    await tx.clinicLocationHours.upsert({
      where: {
        locationId_dayOfWeek_sortOrder: {
          locationId: primaryLocation.id,
          dayOfWeek: schedule.dayOfWeek,
          sortOrder: 0,
        },
      },
      update: schedule,
      create: { locationId: primaryLocation.id, sortOrder: 0, ...schedule },
    });
    await tx.auditLog.create({
      data: {
        clinicId,
        userId: admin.id,
        action: "PLATFORM_CLINIC_HOURS_UPDATED",
        entityType: "ClinicLocationHours",
        entityId: `${primaryLocation.id}:${schedule.dayOfWeek}:0`,
        detail: `${schedule.isClosed ? "Closed" : `${schedule.openTime}-${schedule.closeTime}`} · ${schedule.slotMinutes} minute slots`,
      },
    });
  });

  revalidatePath(`/platform/clinics/${clinicId}`);
  revalidatePath("/dashboard/settings/operations");
}

export async function createLocationAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const name = value(formData, "name", 120);
  if (!Number.isInteger(clinicId) || !name) return;
  const existing = await prisma.clinicLocation.count({ where: { clinicId } });
  await prisma.clinicLocation.create({ data: { clinicId, name, address: value(formData, "address", 1000), phone: value(formData, "phone", 50), email: value(formData, "email", 254), timezone: value(formData, "timezone", 80), isPrimary: existing === 0 } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_CREATED", entityType: "ClinicLocation", detail: `Created location ${name}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function updateLocationAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId")); const name = value(formData, "name", 120);
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId) || !name) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true } }); if (!location) return;
  await prisma.clinicLocation.update({ where: { id: locationId }, data: { name, address: value(formData, "address", 1000), phone: value(formData, "phone", 50), email: value(formData, "email", 254), timezone: value(formData, "timezone", 80) } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_UPDATED", entityType: "ClinicLocation", entityId: String(locationId), detail: `Updated location ${name}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function deactivateLocationAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true, isPrimary: true } });
  if (!location || location.isPrimary) return;
  await prisma.clinicLocation.update({ where: { id: locationId }, data: { active: false } });
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_DEACTIVATED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Branch deactivated" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function saveLocationHoursAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update");
  const clinicId = Number(formData.get("clinicId"));
  const locationId = Number(formData.get("locationId"));
  const schedule = scheduleInput(formData);
  if (
    !Number.isInteger(clinicId)
    || clinicId <= 0
    || !Number.isInteger(locationId)
    || locationId <= 0
    || !schedule
  ) return;

  await prisma.$transaction(async (tx) => {
    const location = await tx.clinicLocation.findFirst({
      where: { id: locationId, clinicId },
      select: { id: true, isPrimary: true },
    });
    if (!location) throw new Error("Branch does not belong to this clinic.");

    await tx.clinicLocationHours.upsert({
      where: {
        locationId_dayOfWeek_sortOrder: {
          locationId: location.id,
          dayOfWeek: schedule.dayOfWeek,
          sortOrder: 0,
        },
      },
      create: { locationId: location.id, sortOrder: 0, ...schedule },
      update: schedule,
    });
    if (location.isPrimary) {
      await tx.clinicHours.upsert({
        where: { clinicId_dayOfWeek: { clinicId, dayOfWeek: schedule.dayOfWeek } },
        create: { clinicId, ...schedule },
        update: schedule,
      });
    }
    await tx.auditLog.create({
      data: {
        clinicId,
        userId: admin.id,
        action: "CLINIC_LOCATION_HOURS_UPDATED",
        entityType: "ClinicLocationHours",
        entityId: `${location.id}:${schedule.dayOfWeek}:0`,
        detail: `${schedule.isClosed ? "Closed" : `${schedule.openTime}-${schedule.closeTime}`} · ${schedule.slotMinutes} minute slots`,
      },
    });
  });

  revalidatePath(`/platform/clinics/${clinicId}`);
  revalidatePath("/dashboard/settings/operations");
}

export async function saveLocationAssignmentsAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  const ids = (key: string) => formData.getAll(key).map(Number).filter(Number.isInteger);
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const [location, providers, services] = await Promise.all([prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId }, select: { id: true } }), prisma.clinicProvider.findMany({ where: { clinicId, id: { in: ids("providerIds") } }, select: { id: true } }), prisma.clinicService.findMany({ where: { clinicId, id: { in: ids("serviceIds") } }, select: { id: true } })]);
  if (!location) return;
  await prisma.$transaction([prisma.clinicLocationProvider.deleteMany({ where: { locationId } }), prisma.clinicLocationService.deleteMany({ where: { locationId } }), prisma.clinicLocationProvider.createMany({ data: providers.map((provider) => ({ locationId, providerId: provider.id })), skipDuplicates: true }), prisma.clinicLocationService.createMany({ data: services.map((service) => ({ locationId, serviceId: service.id })), skipDuplicates: true })]);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_LOCATION_ASSIGNMENTS_UPDATED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Updated branch providers and services" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function setPrimaryLocationAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.update"); const clinicId = Number(formData.get("clinicId")); const locationId = Number(formData.get("locationId"));
  if (!Number.isInteger(clinicId) || !Number.isInteger(locationId)) return;
  const location = await prisma.clinicLocation.findFirst({ where: { id: locationId, clinicId, active: true }, select: { id: true } }); if (!location) return;
  await prisma.$transaction([prisma.clinicLocation.updateMany({ where: { clinicId }, data: { isPrimary: false } }), prisma.clinicLocation.update({ where: { id: locationId }, data: { isPrimary: true } })]);
  await recordAudit({ clinicId, userId: admin.id, action: "CLINIC_PRIMARY_LOCATION_CHANGED", entityType: "ClinicLocation", entityId: String(locationId), detail: "Primary location changed" }); revalidatePath(`/platform/clinics/${clinicId}`);
}

export async function saveSubscriptionAction(formData: FormData) {
  const admin = await requirePlatformPermission("billing.manage"); const clinicId = Number(formData.get("clinicId")); const status = String(formData.get("status") || ""); const billingCycle = String(formData.get("billingCycle") || ""); const priceInput = String(formData.get("price") || ""); const price = priceInput ? Number(priceInput) : null;
  if (!Number.isInteger(clinicId) || !["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"].includes(status) || !["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"].includes(billingCycle) || (price !== null && (!Number.isInteger(price) || price < 0))) return;
  const planIdInput = String(formData.get("planId") || ""); const planId = planIdInput ? Number(planIdInput) : null;
  if (planId !== null && (!Number.isInteger(planId) || !await prisma.subscriptionPlan.findFirst({ where: { id: planId, active: true }, select: { id: true } }))) return;
  await prisma.tenantSubscription.upsert({ where: { clinicId }, create: { clinicId, planId, status, billingCycle, price, internalNotes: value(formData, "internalNotes", 2000) }, update: { planId, status, billingCycle, price, internalNotes: value(formData, "internalNotes", 2000), cancelledAt: status === "CANCELLED" ? new Date() : null } });
  await recordAudit({ clinicId, userId: admin.id, action: "TENANT_SUBSCRIPTION_UPDATED", entityType: "TenantSubscription", detail: `Subscription set to ${status}` }); revalidatePath(`/platform/clinics/${clinicId}`); revalidatePath("/platform");
}

export async function setFeatureEntitlementAction(formData: FormData) {
  const admin = await requirePlatformPermission("settings.manage"); const clinicId = Number(formData.get("clinicId")); const featureKey = String(formData.get("featureKey") || "") as FeatureKey; const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(clinicId) || !(featureKey in FEATURE_REGISTRY)) return;
  await prisma.tenantFeatureEntitlement.upsert({ where: { clinicId_featureKey: { clinicId, featureKey } }, create: { clinicId, featureKey, enabled }, update: { enabled, source: "PLATFORM_OVERRIDE" } });
  await recordAudit({ clinicId, userId: admin.id, action: "TENANT_FEATURE_UPDATED", entityType: "TenantFeatureEntitlement", entityId: featureKey, detail: `${featureKey} ${enabled ? "enabled" : "disabled"}` }); revalidatePath(`/platform/clinics/${clinicId}`);
}
