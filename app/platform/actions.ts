"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { defaultHours, defaultServices } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, requirePlatformPermission, slugifyClinic } from "@/lib/platform";
import { FEATURE_REGISTRY } from "@/lib/features";

const VALID_SUBSCRIPTION_STATES = new Set(["TRIAL", "ACTIVE"]);
const VALID_SERVICE_NAMES = new Set(defaultServices.map((service) => service.name));
function isValidTimezone(value: string) { try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; } }
function isValidPhone(value: string | null) { return !value || /^[+()\-\s\d]{7,25}$/.test(value); }
function protectedClinicSlugs() { return new Set(["deepika-dental-white", ...(process.env.PROTECTED_CLINIC_SLUGS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)]); }

export async function createClinicAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const name = String(formData.get("name") || "").trim();
  const requestedSlug = String(formData.get("slug") || "").trim();
  const slug = slugifyClinic(requestedSlug || name);
  const ownerName = String(formData.get("ownerName") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const locationName = String(formData.get("locationName") || name).trim().slice(0, 120);
  const locationPhone = String(formData.get("locationPhone") || "").trim().slice(0, 50) || null;
  const locationAddress = String(formData.get("locationAddress") || "").trim().slice(0, 1000) || null;
  const timezone = String(formData.get("timezone") || "Asia/Kolkata").trim().slice(0, 80) || "Asia/Kolkata";
  const planIdInput = String(formData.get("planId") || ""); const planId = planIdInput ? Number(planIdInput) : null;
  const providerNames = [...new Map(formData.getAll("providerName").map((item) => String(item).trim().slice(0, 120)).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).values()];
  const selectedServices = new Set(formData.getAll("serviceName").map(String));
  const selectedFeatures = new Set(formData.getAll("featureKey").map(String));
  const subscriptionStatus = String(formData.get("subscriptionStatus") || "TRIAL");
  if (!name || !locationName || !slug || !ownerName || !/^\S+@\S+\.\S+$/.test(ownerEmail) || passwordPolicyError(password) || !isValidTimezone(timezone) || !isValidPhone(locationPhone) || (planId !== null && !Number.isInteger(planId)) || !VALID_SUBSCRIPTION_STATES.has(subscriptionStatus) || providerNames.length > 20 || [...selectedServices].some((service) => !VALID_SERVICE_NAMES.has(service)) || [...selectedFeatures].some((feature) => !(feature in FEATURE_REGISTRY))) redirect("/setup?error=invalid");

  const [takenSlug, takenEmail, plan] = await Promise.all([
    prisma.clinic.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
    planId ? prisma.subscriptionPlan.findFirst({ where: { id: planId, active: true }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (takenSlug || takenEmail || (planId && !plan)) redirect(`/setup?error=${takenSlug ? "slug" : takenEmail ? "email" : "invalid"}`);

  const clinic = await prisma.$transaction(async (tx) => {
    const created = await tx.clinic.create({ data: {
      name,
      brandName: String(formData.get("brandName") || name).trim().slice(0, 120) || name,
      slug,
      phone: locationPhone,
      address: locationAddress,
      timezone,
      hours: { create: defaultHours },
      subscription: planId ? { create: { planId, status: subscriptionStatus, billingCycle: "MONTHLY" } } : undefined,
      featureEntitlements: { create: Object.keys(FEATURE_REGISTRY).map((featureKey) => ({ featureKey, enabled: selectedFeatures.has(featureKey), source: "ONBOARDING" })) },
      whatsapp: { create: { welcomeEnglish: String(formData.get("welcomeEnglish") || "").trim().slice(0, 2000) || null, welcomeHindi: String(formData.get("welcomeHindi") || "").trim().slice(0, 2000) || null } },
      launchChecklist: { create: {} },
      users: { create: { fullName: ownerName, email: ownerEmail, role: "OWNER", passwordHash: hashPassword(password) } },
      auditLogs: { create: { action: "CLINIC_PROVISIONED", entityType: "Clinic", detail: `Provisioned by ${admin.email}` } },
    } });
    const [services, providers] = await Promise.all([
      tx.clinicService.createManyAndReturn({ data: defaultServices.filter((service) => !selectedServices.size || selectedServices.has(service.name)).map((service) => ({ ...service, clinicId: created.id })) }),
      providerNames.length ? tx.clinicProvider.createManyAndReturn({ data: providerNames.map((name) => ({ clinicId: created.id, name })) }) : Promise.resolve([]),
    ]);
    const location = await tx.clinicLocation.create({ data: { clinicId: created.id, name: locationName, phone: locationPhone, address: locationAddress, timezone, isPrimary: true, hours: { create: defaultHours } } });
    await Promise.all([
      services.length ? tx.clinicLocationService.createMany({ data: services.map((service) => ({ locationId: location.id, serviceId: service.id })) }) : Promise.resolve({ count: 0 }),
      providers.length ? tx.clinicLocationProvider.createMany({ data: providers.map((provider) => ({ locationId: location.id, providerId: provider.id })) }) : Promise.resolve({ count: 0 }),
    ]);
    return created;
  }, { isolationLevel: "Serializable" });
  revalidatePath("/setup");
  redirect(`/setup?created=${clinic.slug}`);
}

export async function saveSubscriptionPlanAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const id = Number(formData.get("planId")); const name = String(formData.get("name") || "").trim().slice(0, 120); const code = slugifyClinic(String(formData.get("code") || name)).toUpperCase().replace(/-/g, "_"); const description = String(formData.get("description") || "").trim().slice(0, 1000) || null;
  if (!name || !code) return;
  const duplicate = await prisma.subscriptionPlan.findFirst({ where: { OR: [{ name }, { code }], ...(Number.isInteger(id) ? [{ NOT: { id } }] : []) }, select: { id: true } }); if (duplicate) return;
  const plan = Number.isInteger(id) ? await prisma.subscriptionPlan.update({ where: { id }, data: { name, code, description } }) : await prisma.subscriptionPlan.create({ data: { name, code, description } });
  await recordAudit({ clinicId: admin.clinicId, userId: admin.id, action: "SUBSCRIPTION_PLAN_SAVED", entityType: "SubscriptionPlan", entityId: String(plan.id), detail: `Saved plan ${plan.code}` }); revalidatePath("/platform");
}

export async function toggleSubscriptionPlanAction(formData: FormData) {
  const admin = await requirePlatformAdmin(); const planId = Number(formData.get("planId")); const active = formData.get("active") === "true"; if (!Number.isInteger(planId)) return;
  const plan = await prisma.subscriptionPlan.update({ where: { id: planId }, data: { active } }); await recordAudit({ clinicId: admin.clinicId, userId: admin.id, action: "SUBSCRIPTION_PLAN_STATUS_CHANGED", entityType: "SubscriptionPlan", entityId: String(planId), detail: `${plan.code} ${active ? "activated" : "archived"}` }); revalidatePath("/platform");
}

export async function setClinicStatusAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const status = String(formData.get("status"));
  if (!Number.isInteger(clinicId) || !["ACTIVE", "SUSPENDED"].includes(status)) return;
  await prisma.clinic.update({ where: { id: clinicId }, data: { status } });
  await recordAudit({ clinicId, userId: admin.id, action: `CLINIC_${status}`, entityType: "Clinic", entityId: String(clinicId), detail: `Status changed to ${status} by platform control portal` });
  revalidatePath("/setup");
}

export async function deleteClinicPermanentlyAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (!Number.isInteger(clinicId)) redirect("/setup?error=delete-invalid");

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, slug: true, name: true, status: true } });
  const protectedSlugs = protectedClinicSlugs();
  if (!clinic || !clinic.slug || clinic.id === admin.clinicId || protectedSlugs.has(clinic.slug) || clinic.status !== "SUSPENDED" || confirmation !== clinic.slug) {
    redirect("/setup?error=delete-protected");
  }

  await prisma.$transaction(async (tx) => {
    // Appointments and patients deliberately have restrictive clinic FKs; all other
    // tenant-owned relations either cascade or are linked through these records.
    await tx.purchaseOrder.deleteMany({ where: { clinicId } });
    await tx.inventoryMovement.deleteMany({ where: { clinicId } });
    await tx.appointment.deleteMany({ where: { clinicId } });
    await tx.patient.deleteMany({ where: { clinicId } });
    await tx.clinic.delete({ where: { id: clinicId } });
    await tx.auditLog.create({ data: { clinicId: admin.clinicId, userId: admin.id, action: "CLINIC_PERMANENTLY_DELETED", entityType: "Clinic", entityId: String(clinicId), detail: `Deleted test clinic ${clinic.name} (${clinic.slug})` } });
  });
  revalidatePath("/setup");
  redirect(`/setup?deleted=${encodeURIComponent(clinic.slug)}`);
}

/** Creates an additional owner for a clinic that already exists. Never overwrites an account. */
export async function createClinicOwnerAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const clinicId = Number(formData.get("clinicId"));
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!Number.isInteger(clinicId) || !fullName || !/^\S+@\S+\.\S+$/.test(email) || passwordPolicyError(password)) {
    redirect("/setup?error=owner-invalid");
  }

  const [clinic, existingUser] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, slug: true } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (!clinic) redirect("/setup?error=owner-clinic");
  if (existingUser) redirect("/setup?error=owner-email");

  const owner = await prisma.user.create({
    data: { clinicId, fullName, email, role: "OWNER", passwordHash: hashPassword(password) },
  });
  await recordAudit({
    clinicId,
    userId: admin.id,
    action: "CLINIC_OWNER_CREATED",
    entityType: "User",
    entityId: String(owner.id),
    detail: `Owner login created by ${admin.email}`,
  });
  revalidatePath("/setup");
  redirect(`/setup?ownerCreated=${encodeURIComponent(clinic.slug || String(clinic.id))}`);
}

/** Platform operations may enable or pause an existing tenant automation, never edit its executable behaviour. */
export async function setAutomationEnabledAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const automationId = Number(formData.get("automationId"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(automationId)) return;
  const automation = await prisma.whatsAppAutomation.findUnique({ where: { id: automationId }, select: { id: true, clinicId: true, name: true } });
  if (!automation) return;
  await prisma.whatsAppAutomation.update({ where: { id: automation.id }, data: { enabled } });
  await recordAudit({ clinicId: automation.clinicId, userId: admin.id, action: "WHATSAPP_AUTOMATION_TOGGLED", entityType: "WhatsAppAutomation", entityId: String(automation.id), detail: `${automation.name} ${enabled ? "enabled" : "paused"} from Control Centre` });
  revalidatePath("/platform/automations");
  revalidatePath(`/platform/clinics/${automation.clinicId}`);
}

export async function savePlatformOnboardingAction(formData: FormData) {
  const admin = await requirePlatformPermission("onboarding.manage"); const clinicId = Number(formData.get("clinicId")); const stage = String(formData.get("stage") || ""); const target = String(formData.get("targetGoLiveAt") || "");
  const allowed = ["LEAD", "QUALIFIED", "DEMO", "AGREEMENT", "TENANT_CREATED", "BUSINESS_DETAILS", "BRANDING", "DOCTORS", "SERVICES", "WHATSAPP_SETUP", "VERIFICATION", "TESTING", "TRAINING", "READY", "LIVE"];
  if (!Number.isInteger(clinicId) || !allowed.includes(stage)) return;
  const targetGoLiveAt = target ? new Date(target) : null; if (targetGoLiveAt && Number.isNaN(targetGoLiveAt.valueOf())) return;
  await prisma.platformOnboarding.upsert({ where: { clinicId }, create: { clinicId, stage, ownerId: admin.id, targetGoLiveAt, blockers: String(formData.get("blockers") || "").trim().slice(0, 2000) || null, notes: String(formData.get("notes") || "").trim().slice(0, 4000) || null }, update: { stage, ownerId: admin.id, targetGoLiveAt, blockers: String(formData.get("blockers") || "").trim().slice(0, 2000) || null, notes: String(formData.get("notes") || "").trim().slice(0, 4000) || null } });
  await recordAudit({ clinicId, userId: admin.id, action: "PLATFORM_ONBOARDING_UPDATED", entityType: "PlatformOnboarding", detail: `Stage set to ${stage}` }); revalidatePath("/platform/onboarding");
}

export async function createSupportTicketAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage"); const clinicIdValue = String(formData.get("clinicId") || ""); const clinicId = clinicIdValue ? Number(clinicIdValue) : null; const subject = String(formData.get("subject") || "").trim().slice(0, 200); const description = String(formData.get("description") || "").trim().slice(0, 4000); const priority = String(formData.get("priority") || "NORMAL");
  if (!subject || !description || (clinicId !== null && !Number.isInteger(clinicId)) || !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(priority)) return;
  const ticket = await prisma.platformSupportTicket.create({ data: { clinicId, requester: admin.email, subject, description, priority, assignedTo: admin.id } });
  await prisma.platformNotification.create({ data: { clinicId, severity: priority === "CRITICAL" ? "CRITICAL" : "INFO", title: `Support ticket #${ticket.id}: ${subject}`, href: "/platform/support" } }); revalidatePath("/platform/support"); revalidatePath("/platform/notifications");
}

export async function setSupportTicketStatusAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage"); const ticketId = Number(formData.get("ticketId")); const status = String(formData.get("status") || ""); if (!Number.isInteger(ticketId) || !["OPEN", "INVESTIGATING", "RESOLVED", "IGNORED"].includes(status)) return;
  await prisma.platformSupportTicket.update({ where: { id: ticketId }, data: { status, assignedTo: admin.id, resolvedAt: status === "RESOLVED" ? new Date() : null } }); revalidatePath("/platform/support");
}

export async function markNotificationReadAction(formData: FormData) { await requirePlatformAdmin(); const id = Number(formData.get("id")); if (Number.isInteger(id)) await prisma.platformNotification.update({ where: { id }, data: { readAt: new Date() } }); revalidatePath("/platform/notifications"); }
