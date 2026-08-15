"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, passwordPolicyError } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { defaultHours, defaultServices } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, slugifyClinic } from "@/lib/platform";
import { FEATURE_REGISTRY } from "@/lib/features";
import { Prisma } from "@prisma/client";

const VALID_SUBSCRIPTION_STATES = new Set(["TRIAL", "ACTIVE"]);
const VALID_SERVICE_NAMES = new Set(
  defaultServices.map((service) => service.name),
);
function isValidTimezone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
function isValidPhone(value: string | null) {
  return !value || /^[+()\-\s\d]{7,25}$/.test(value);
}
const DRAFT_FIELDS = new Set([
  "name",
  "ownerName",
  "ownerEmail",
  "brandName",
  "locationName",
  "locationPhone",
  "locationAddress",
  "timezone",
  "providerName",
  "welcomeEnglish",
  "welcomeHindi",
  "planId",
  "subscriptionStatus",
  "slug",
  "serviceName",
  "featureKey",
]);
function extractDraftData(formData: FormData) {
  const data: Record<string, string | string[]> = {};
  for (const field of DRAFT_FIELDS) {
    const values = formData
      .getAll(field)
      .map((value) => String(value).trim())
      .filter(Boolean);
    if (values.length)
      data[field] =
        values.length === 1
          ? values[0].slice(0, 4000)
          : values.map((value) => value.slice(0, 400));
  }
  return data;
}
function canonicalDraftData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    ),
  );
}

/** Saves only non-secret wizard progress. Passwords and Meta credentials never enter a draft. */
export async function saveClinicProvisioningDraftAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.create");
  const requestedId = String(formData.get("draftId") || "").trim();
  const requestedStep = Number(formData.get("currentStep") || 0);
  const currentStep = Number.isInteger(requestedStep)
    ? Math.min(10, Math.max(0, requestedStep))
    : 0;
  const data = extractDraftData(formData);
  const draft = requestedId
    ? await prisma.platformProvisioningDraft
        .updateMany({
          where: {
            id: requestedId,
            ownerUserId: admin.id,
            status: { in: ["ACTIVE", "PREFLIGHTED"] },
          },
          data: { data, currentStep, status: "ACTIVE" },
        })
        .then(async (result) =>
          result.count
            ? prisma.platformProvisioningDraft.findUnique({
                where: { id: requestedId },
                select: { id: true },
              })
            : null,
        )
    : null;
  if (requestedId && !draft)
    throw new Error("Draft is unavailable or no longer active.");
  const saved =
    draft ??
    (await prisma.platformProvisioningDraft.create({
      data: { ownerUserId: admin.id, data, currentStep },
      select: { id: true },
    }));
  return { draftId: saved.id };
}

export async function preflightClinicProvisioningAction(
  formData: FormData,
): Promise<{ ok: boolean; issues: string[]; checkedAt?: string }> {
  const admin = await requirePlatformPermission("tenant.create");
  const draftId = String(formData.get("draftId") || "").trim();
  const data = extractDraftData(formData);
  const password = String(formData.get("password") || "");
  const name = String(data.name || "");
  const ownerName = String(data.ownerName || "");
  const ownerEmail = String(data.ownerEmail || "").toLowerCase();
  const slug = slugifyClinic(String(data.slug || name));
  const locationName = String(data.locationName || name);
  const locationPhone = String(data.locationPhone || "") || null;
  const timezone = String(data.timezone || "Asia/Kolkata");
  const planId = data.planId ? Number(data.planId) : null;
  const subscriptionStatus = String(data.subscriptionStatus || "TRIAL");
  const selectedServices = new Set(
    Array.isArray(data.serviceName)
      ? data.serviceName
      : data.serviceName
        ? [data.serviceName]
        : [],
  );
  const selectedFeatures = new Set(
    Array.isArray(data.featureKey)
      ? data.featureKey
      : data.featureKey
        ? [data.featureKey]
        : [],
  );
  const issues: string[] = [];
  if (!draftId) issues.push("Save the draft before running preflight.");
  if (!name || !ownerName || !/^\S+@\S+\.\S+$/.test(ownerEmail))
    issues.push("Organization and owner details are incomplete.");
  const passwordIssue = passwordPolicyError(password);
  if (passwordIssue) issues.push(passwordIssue);
  if (
    !locationName ||
    !isValidTimezone(timezone) ||
    !isValidPhone(locationPhone)
  )
    issues.push("Location, phone, or timezone is invalid.");
  if (!slug) issues.push("Workspace key is required.");
  if (
    !selectedServices.size ||
    [...selectedServices].some((service) => !VALID_SERVICE_NAMES.has(service))
  )
    issues.push("Select at least one valid service.");
  if (
    !selectedFeatures.size ||
    [...selectedFeatures].some((feature) => !(feature in FEATURE_REGISTRY))
  )
    issues.push("Select at least one valid feature.");
  if (!VALID_SUBSCRIPTION_STATES.has(subscriptionStatus))
    issues.push("Subscription status is invalid.");
  if (planId !== null && !Number.isInteger(planId))
    issues.push("Subscription plan is invalid.");
  if (issues.length) return { ok: false, issues };
  const [draft, takenSlug, takenEmail, plan] = await Promise.all([
    prisma.platformProvisioningDraft.findFirst({
      where: { id: draftId, ownerUserId: admin.id, status: "ACTIVE" },
      select: { id: true },
    }),
    prisma.clinic.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    }),
    planId
      ? prisma.subscriptionPlan.findFirst({
          where: { id: planId, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!draft) issues.push("Draft is unavailable or no longer active.");
  if (takenSlug) issues.push("Workspace key is already in use.");
  if (takenEmail) issues.push("Owner email already has an account.");
  if (planId && !plan)
    issues.push("Selected subscription plan is unavailable.");
  if (issues.length) return { ok: false, issues };
  await prisma.platformProvisioningDraft.update({
    where: { id: draftId },
    data: { data, currentStep: 10, status: "PREFLIGHTED" },
  });
  return { ok: true, issues: [], checkedAt: new Date().toISOString() };
}

export async function duplicateClinicProvisioningDraftAction(
  formData: FormData,
) {
  const admin = await requirePlatformPermission("tenant.create");
  const draftId = String(formData.get("draftId") || "");
  const source = await prisma.platformProvisioningDraft.findFirst({
    where: { id: draftId, ownerUserId: admin.id },
    select: { data: true, currentStep: true },
  });
  if (!source) redirect("/platform/clinics/new?error=draft-not-found");
  const data = {
    ...(source.data as Record<string, string | string[]>),
    _duplicatedAt: new Date().toISOString(),
  };
  const copy = await prisma.platformProvisioningDraft.create({
    data: { ownerUserId: admin.id, data, currentStep: source.currentStep },
    select: { id: true },
  });
  revalidatePath("/platform/clinics/new");
  redirect(`/platform/clinics/new?draft=${encodeURIComponent(copy.id)}`);
}

export async function archiveClinicProvisioningDraftAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.create");
  const draftId = String(formData.get("draftId") || "");
  const draft = await prisma.platformProvisioningDraft.findFirst({
    where: {
      id: draftId,
      ownerUserId: admin.id,
      status: { in: ["ACTIVE", "PREFLIGHTED"] },
    },
    select: { id: true },
  });
  if (!draft) redirect("/platform/clinics/new?error=draft-not-found");
  await prisma.platformProvisioningDraft.update({
    where: { id: draftId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
  await recordAudit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: "PROVISIONING_DRAFT_ARCHIVED",
    entityType: "PlatformProvisioningDraft",
    entityId: draftId,
    detail: "Provisioning draft archived by its owner",
  });
  revalidatePath("/platform/clinics/new");
  redirect("/platform/clinics/new?draftState=archived");
}

export async function discardClinicProvisioningDraftAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.create");
  const draftId = String(formData.get("draftId") || "");
  const confirmation = String(formData.get("confirmation") || "").trim();
  const reason = "Discarded after explicit confirmation";
  if (confirmation !== "DISCARD")
    redirect(
      `/platform/clinics/new?draft=${encodeURIComponent(draftId)}&error=draft-confirmation`,
    );
  const draft = await prisma.platformProvisioningDraft.findFirst({
    where: {
      id: draftId,
      ownerUserId: admin.id,
      status: { in: ["ACTIVE", "PREFLIGHTED"] },
    },
    select: { id: true },
  });
  if (!draft) redirect("/platform/clinics/new?error=draft-not-found");
  await prisma.platformProvisioningDraft.update({
    where: { id: draftId },
    data: { status: "DISCARDED", discardedAt: new Date() },
  });
  await recordAudit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: "PROVISIONING_DRAFT_DISCARDED",
    entityType: "PlatformProvisioningDraft",
    entityId: draftId,
    detail: `Recoverable discard. Reason: ${reason}`,
  });
  revalidatePath("/platform/clinics/new");
  redirect("/platform/clinics/new?draftState=discarded");
}

export async function restoreClinicProvisioningDraftAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.create");
  const draftId = String(formData.get("draftId") || "");
  const result = await prisma.platformProvisioningDraft.updateMany({
    where: {
      id: draftId,
      ownerUserId: admin.id,
      status: { in: ["ARCHIVED", "DISCARDED"] },
    },
    data: { status: "ACTIVE", archivedAt: null, discardedAt: null },
  });
  if (!result.count) redirect("/platform/clinics/new?error=draft-not-found");
  await recordAudit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: "PROVISIONING_DRAFT_RESTORED",
    entityType: "PlatformProvisioningDraft",
    entityId: draftId,
    detail: "Recoverable provisioning draft restored by its owner",
  });
  revalidatePath("/platform/clinics/new");
  redirect(`/platform/clinics/new?draft=${encodeURIComponent(draftId)}`);
}

export async function createClinicAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.create");
  const name = String(formData.get("name") || "").trim();
  const requestedSlug = String(formData.get("slug") || "").trim();
  const slug = slugifyClinic(requestedSlug || name);
  const ownerName = String(formData.get("ownerName") || "").trim();
  const ownerEmail = String(formData.get("ownerEmail") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const locationName = String(formData.get("locationName") || name)
    .trim()
    .slice(0, 120);
  const locationPhone =
    String(formData.get("locationPhone") || "")
      .trim()
      .slice(0, 50) || null;
  const locationAddress =
    String(formData.get("locationAddress") || "")
      .trim()
      .slice(0, 1000) || null;
  const timezone =
    String(formData.get("timezone") || "Asia/Kolkata")
      .trim()
      .slice(0, 80) || "Asia/Kolkata";
  const planIdInput = String(formData.get("planId") || "");
  const planId = planIdInput ? Number(planIdInput) : null;
  const providerNames = [
    ...new Map(
      formData
        .getAll("providerName")
        .map((item) => String(item).trim().slice(0, 120))
        .filter(Boolean)
        .map((name) => [name.toLocaleLowerCase(), name]),
    ).values(),
  ];
  const selectedServices = new Set(formData.getAll("serviceName").map(String));
  const selectedFeatures = new Set(formData.getAll("featureKey").map(String));
  const subscriptionStatus = String(
    formData.get("subscriptionStatus") || "TRIAL",
  );
  const draftId = String(formData.get("draftId") || "").trim();
  const activationAcknowledged =
    formData.get("activationAcknowledgement") === "on";
  const activationConfirmation = String(
    formData.get("activationConfirmation") || "",
  );
  if (
    !draftId ||
    !activationAcknowledged ||
    activationConfirmation !== "ACTIVATE"
  )
    redirect(
      `/platform/clinics/new${draftId ? `?draft=${encodeURIComponent(draftId)}&` : "?"}error=activation-confirmation`,
    );
  if (
    !name ||
    !locationName ||
    !slug ||
    !ownerName ||
    !/^\S+@\S+\.\S+$/.test(ownerEmail) ||
    passwordPolicyError(password) ||
    !isValidTimezone(timezone) ||
    !isValidPhone(locationPhone) ||
    (planId !== null && !Number.isInteger(planId)) ||
    !VALID_SUBSCRIPTION_STATES.has(subscriptionStatus) ||
    providerNames.length > 20 ||
    selectedServices.size < 1 ||
    selectedFeatures.size < 1 ||
    [...selectedServices].some(
      (service) => !VALID_SERVICE_NAMES.has(service),
    ) ||
    [...selectedFeatures].some((feature) => !(feature in FEATURE_REGISTRY))
  )
    redirect(
      `/platform/clinics/new?draft=${encodeURIComponent(draftId)}&error=invalid`,
    );

  const preflightDraft = await prisma.platformProvisioningDraft.findFirst({
    where: { id: draftId, ownerUserId: admin.id, status: "PREFLIGHTED" },
    select: { data: true },
  });
  if (
    !preflightDraft ||
    canonicalDraftData(preflightDraft.data) !==
      canonicalDraftData(extractDraftData(formData))
  )
    redirect(
      `/platform/clinics/new?draft=${encodeURIComponent(draftId)}&error=preflight-required`,
    );

  const [takenSlug, takenEmail, plan] = await Promise.all([
    prisma.clinic.findUnique({ where: { slug }, select: { id: true } }),
    prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    }),
    planId
      ? prisma.subscriptionPlan.findFirst({
          where: { id: planId, active: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (takenSlug || takenEmail || (planId && !plan))
    redirect(
      `/platform/clinics/new?draft=${encodeURIComponent(draftId)}&error=${takenSlug ? "slug" : takenEmail ? "email" : "invalid"}`,
    );

  let clinic: { id: number; slug: string | null };
  try {
    clinic = await prisma.$transaction(
      async (tx) => {
        const claim = await tx.platformProvisioningDraft.updateMany({
          where: { id: draftId, ownerUserId: admin.id, status: "PREFLIGHTED" },
          data: { status: "ACTIVATING" },
        });
        if (!claim.count) throw new Error("ACTIVATION_CLAIM_FAILED");
        const created = await tx.clinic.create({
          data: {
            name,
            status: "ONBOARDING",
            brandName:
              String(formData.get("brandName") || name)
                .trim()
                .slice(0, 120) || name,
            slug,
            phone: locationPhone,
            address: locationAddress,
            timezone,
            hours: { create: defaultHours },
            subscription: planId
              ? {
                  create: {
                    planId,
                    status: subscriptionStatus,
                    billingCycle: "MONTHLY",
                  },
                }
              : undefined,
            featureEntitlements: {
              create: Object.keys(FEATURE_REGISTRY).map((featureKey) => ({
                featureKey,
                enabled: selectedFeatures.has(featureKey),
                source: "ONBOARDING",
              })),
            },
            whatsapp: {
              create: {
                welcomeEnglish:
                  String(formData.get("welcomeEnglish") || "")
                    .trim()
                    .slice(0, 2000) || null,
                welcomeHindi:
                  String(formData.get("welcomeHindi") || "")
                    .trim()
                    .slice(0, 2000) || null,
              },
            },
            whatsappAutomations: {
              create: {
                name: "WhatsApp reception and booking",
                trigger: "WHATSAPP_INBOUND",
                enabled: true,
              },
            },
            launchChecklist: { create: {} },
            users: {
              create: {
                fullName: ownerName,
                email: ownerEmail,
                role: "OWNER",
                passwordHash: hashPassword(password),
                mustChangePassword: true,
              },
            },
            auditLogs: {
              create: {
                userId: admin.id,
                action: "CLINIC_PROVISIONED",
                entityType: "Clinic",
                detail: `Provisioned in ONBOARDING by ${admin.email}; tenant access remains blocked until the separate go-live transition.`,
              },
            },
          },
        });
        const [services, providers] = await Promise.all([
          tx.clinicService.createManyAndReturn({
            data: defaultServices
              .filter(
                (service) =>
                  !selectedServices.size || selectedServices.has(service.name),
              )
              .map((service) => ({ ...service, clinicId: created.id })),
          }),
          providerNames.length
            ? tx.clinicProvider.createManyAndReturn({
                data: providerNames.map((name) => ({
                  clinicId: created.id,
                  name,
                })),
              })
            : Promise.resolve([]),
        ]);
        const location = await tx.clinicLocation.create({
          data: {
            clinicId: created.id,
            name: locationName,
            phone: locationPhone,
            address: locationAddress,
            timezone,
            isPrimary: true,
            hours: { create: defaultHours },
          },
        });
        await Promise.all([
          services.length
            ? tx.clinicLocationService.createMany({
                data: services.map((service) => ({
                  locationId: location.id,
                  serviceId: service.id,
                })),
              })
            : Promise.resolve({ count: 0 }),
          providers.length
            ? tx.clinicLocationProvider.createMany({
                data: providers.map((provider) => ({
                  locationId: location.id,
                  providerId: provider.id,
                })),
              })
            : Promise.resolve({ count: 0 }),
        ]);
        if (draftId)
          await tx.platformProvisioningDraft.deleteMany({
            where: { id: draftId, ownerUserId: admin.id },
          });
        return created;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ACTIVATION_CLAIM_FAILED")
      redirect("/platform/clinics/new?error=activation-in-progress");
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      redirect(
        `/platform/clinics/new?draft=${encodeURIComponent(draftId)}&error=conflict`,
      );
    throw error;
  }
  revalidatePath("/platform");
  revalidatePath("/platform/clinics");
  redirect(
    `/platform/clinics/${clinic.id}?created=${encodeURIComponent(clinic.slug || String(clinic.id))}`,
  );
}

export async function saveSubscriptionPlanAction(formData: FormData) {
  const admin = await requirePlatformPermission("billing.manage");
  const id = Number(formData.get("planId"));
  const name = String(formData.get("name") || "")
    .trim()
    .slice(0, 120);
  const code = slugifyClinic(String(formData.get("code") || name))
    .toUpperCase()
    .replace(/-/g, "_");
  const description =
    String(formData.get("description") || "")
      .trim()
      .slice(0, 1000) || null;
  if (!name || !code) return;
  const duplicate = await prisma.subscriptionPlan.findFirst({
    where: {
      OR: [{ name }, { code }],
      ...(Number.isInteger(id) ? [{ NOT: { id } }] : []),
    },
    select: { id: true },
  });
  if (duplicate) return;
  const plan = Number.isInteger(id)
    ? await prisma.subscriptionPlan.update({
        where: { id },
        data: { name, code, description },
      })
    : await prisma.subscriptionPlan.create({
        data: { name, code, description },
      });
  await recordAudit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: "SUBSCRIPTION_PLAN_SAVED",
    entityType: "SubscriptionPlan",
    entityId: String(plan.id),
    detail: `Saved plan ${plan.code}`,
  });
  revalidatePath("/platform");
}

export async function toggleSubscriptionPlanAction(formData: FormData) {
  const admin = await requirePlatformPermission("billing.manage");
  const planId = Number(formData.get("planId"));
  const active = formData.get("active") === "true";
  if (!Number.isInteger(planId)) return;
  const plan = await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { active },
  });
  await recordAudit({
    clinicId: admin.clinicId,
    userId: admin.id,
    action: "SUBSCRIPTION_PLAN_STATUS_CHANGED",
    entityType: "SubscriptionPlan",
    entityId: String(planId),
    detail: `${plan.code} ${active ? "activated" : "archived"}`,
  });
  revalidatePath("/platform");
}

export async function setClinicStatusAction(_formData: FormData) {
  void _formData;
  await requirePlatformPermission("tenant.suspend");
  redirect("/setup?error=legacy-lifecycle-disabled");
}

const LIFECYCLE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["ONBOARDING", "ARCHIVED"],
  ONBOARDING: ["ACTIVE", "SUSPENDED", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "ARCHIVED"],
  SUSPENDED: ["ONBOARDING", "ACTIVE", "ARCHIVED"],
  ARCHIVED: ["ONBOARDING"],
};

/**
 * Lifecycle changes are intentionally non-destructive. The existing session
 * guard permits only ACTIVE clinics, so DRAFT/ONBOARDING/SUSPENDED/ARCHIVED
 * tenants cannot access the clinic SaaS while platform access remains separate.
 */
export async function transitionClinicLifecycleAction(formData: FormData) {
  const admin = await requirePlatformPermission("tenant.suspend");
  const clinicId = Number(formData.get("clinicId"));
  const nextStatus = String(formData.get("status") || "");
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (
    !Number.isInteger(clinicId) ||
    reason.length < 5 ||
    !LIFECYCLE_TRANSITIONS ||
    !Object.hasOwn(LIFECYCLE_TRANSITIONS, nextStatus)
  )
    return;
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, slug: true, status: true },
  });
  if (
    !clinic ||
    clinic.id === admin.clinicId ||
    !LIFECYCLE_TRANSITIONS[clinic.status]?.includes(nextStatus)
  )
    return;
  // High-impact state changes require a deliberate, tenant-specific confirmation.
  if (confirmation !== `${nextStatus} ${clinic.slug || clinic.id}`) return;
  await prisma.$transaction([
    prisma.clinic.update({
      where: { id: clinic.id },
      data: { status: nextStatus },
    }),
    prisma.auditLog.create({
      data: {
        clinicId: clinic.id,
        userId: admin.id,
        action: `clinic.${nextStatus.toLowerCase()}`,
        entityType: "Clinic",
        entityId: String(clinic.id),
        detail: `Transitioned from ${clinic.status} to ${nextStatus}. Reason: ${reason}`,
      },
    }),
  ]);
  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  revalidatePath(`/platform/clinics/${clinic.id}`);
}

export async function deleteClinicPermanentlyAction(_formData: FormData) {
  void _formData;
  await requirePlatformPermission("tenant.suspend");
  // Permanent tenant deletion is disabled. Tenant data must be retained and
  // lifecycle-managed through suspension or archival instead.
  redirect("/setup?error=delete-disabled");
}

/** Creates an additional owner for a clinic that already exists. Never overwrites an account. */
export async function createClinicOwnerAction(formData: FormData) {
  const admin = await requirePlatformPermission("user.manage");
  const clinicId = Number(formData.get("clinicId"));
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (
    !Number.isInteger(clinicId) ||
    !fullName ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    passwordPolicyError(password)
  ) {
    redirect("/setup?error=owner-invalid");
  }

  const [clinic, existingUser] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, slug: true },
    }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (!clinic) redirect("/setup?error=owner-clinic");
  if (existingUser) redirect("/setup?error=owner-email");

  const owner = await prisma.user.create({
    data: {
      clinicId,
      fullName,
      email,
      role: "OWNER",
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    },
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
  redirect(
    `/setup?ownerCreated=${encodeURIComponent(clinic.slug || String(clinic.id))}`,
  );
}

/** Platform operations may enable or pause an existing tenant automation, never edit its executable behaviour. */
export async function setAutomationEnabledAction(formData: FormData) {
  const admin = await requirePlatformPermission("whatsapp.manage");
  const automationId = Number(formData.get("automationId"));
  const clinicId = Number(formData.get("clinicId"));
  const enabled = formData.get("enabled") === "true";
  if ((!Number.isInteger(automationId) || automationId < 1) && (!Number.isInteger(clinicId) || clinicId < 1)) return;
  const existing = Number.isInteger(automationId) && automationId > 0
    ? await prisma.whatsAppAutomation.findUnique({ where: { id: automationId }, select: { id: true, clinicId: true, name: true, trigger: true } })
    : null;
  if (existing && existing.trigger !== "WHATSAPP_INBOUND") throw new Error("Only the tenant inbound automation can be controlled here.");
  const targetClinicId = existing?.clinicId || clinicId;
  const clinic = await prisma.clinic.findUnique({ where: { id: targetClinicId }, select: { id: true } });
  if (!clinic) return;
  const automation = await prisma.whatsAppAutomation.upsert({
    where: { clinicId_trigger: { clinicId: clinic.id, trigger: "WHATSAPP_INBOUND" } },
    create: { clinicId: clinic.id, name: "WhatsApp reception and booking", trigger: "WHATSAPP_INBOUND", enabled },
    update: { enabled },
    select: { id: true, clinicId: true, name: true },
  });
  await recordAudit({
    clinicId: automation.clinicId,
    userId: admin.id,
    action: "WHATSAPP_AUTOMATION_TOGGLED",
    entityType: "WhatsAppAutomation",
    entityId: String(automation.id),
    detail: `${automation.name} ${enabled ? "enabled" : "paused"} from Control Centre`,
  });
  revalidatePath("/platform/automations");
  revalidatePath(`/platform/clinics/${automation.clinicId}`);
}

export async function savePlatformOnboardingAction(formData: FormData) {
  const admin = await requirePlatformPermission("onboarding.manage");
  const clinicId = Number(formData.get("clinicId"));
  const stage = String(formData.get("stage") || "");
  const target = String(formData.get("targetGoLiveAt") || "");
  const allowed = [
    "LEAD",
    "QUALIFIED",
    "DEMO",
    "AGREEMENT",
    "TENANT_CREATED",
    "BUSINESS_DETAILS",
    "BRANDING",
    "DOCTORS",
    "SERVICES",
    "WHATSAPP_SETUP",
    "VERIFICATION",
    "TESTING",
    "TRAINING",
    "READY",
    "LIVE",
  ];
  if (!Number.isInteger(clinicId) || !allowed.includes(stage)) return;
  const targetGoLiveAt = target ? new Date(target) : null;
  if (targetGoLiveAt && Number.isNaN(targetGoLiveAt.valueOf())) return;
  await prisma.platformOnboarding.upsert({
    where: { clinicId },
    create: {
      clinicId,
      stage,
      ownerId: admin.id,
      targetGoLiveAt,
      blockers:
        String(formData.get("blockers") || "")
          .trim()
          .slice(0, 2000) || null,
      notes:
        String(formData.get("notes") || "")
          .trim()
          .slice(0, 4000) || null,
    },
    update: {
      stage,
      ownerId: admin.id,
      targetGoLiveAt,
      blockers:
        String(formData.get("blockers") || "")
          .trim()
          .slice(0, 2000) || null,
      notes:
        String(formData.get("notes") || "")
          .trim()
          .slice(0, 4000) || null,
    },
  });
  await recordAudit({
    clinicId,
    userId: admin.id,
    action: "PLATFORM_ONBOARDING_UPDATED",
    entityType: "PlatformOnboarding",
    detail: `Stage set to ${stage}`,
  });
  revalidatePath("/platform/onboarding");
}

export async function createSupportTicketAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage");
  const clinicIdValue = String(formData.get("clinicId") || "");
  const clinicId = clinicIdValue ? Number(clinicIdValue) : null;
  const subject = String(formData.get("subject") || "")
    .trim()
    .slice(0, 200);
  const description = String(formData.get("description") || "")
    .trim()
    .slice(0, 4000);
  const priority = String(formData.get("priority") || "NORMAL");
  if (
    !subject ||
    !description ||
    (clinicId !== null && !Number.isInteger(clinicId)) ||
    !["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(priority)
  )
    return;
  if (clinicId !== null && !await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true } })) return;
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.platformSupportTicket.create({
      data: {
        clinicId,
        requester: admin.email,
        subject,
        description,
        priority,
        assignedTo: admin.id,
      },
    });
    await tx.platformNotification.create({
      data: {
        clinicId,
        severity: priority === "CRITICAL" ? "CRITICAL" : "INFO",
        title: `Support ticket #${ticket.id}: ${subject}`,
        href: "/platform/support",
      },
    });
  });
  revalidatePath("/platform/support");
  revalidatePath("/platform/notifications");
}

export async function setSupportTicketStatusAction(formData: FormData) {
  const admin = await requirePlatformPermission("support.manage");
  const ticketId = Number(formData.get("ticketId"));
  const status = String(formData.get("status") || "");
  if (
    !Number.isInteger(ticketId) ||
    !["OPEN", "INVESTIGATING", "RESOLVED", "IGNORED"].includes(status)
  )
    return;
  await prisma.platformSupportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      assignedTo: admin.id,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    },
  });
  revalidatePath("/platform/support");
}

export async function markNotificationReadAction(formData: FormData) {
  await requirePlatformPermission("logs.read");
  const id = Number(formData.get("id"));
  if (Number.isInteger(id))
    await prisma.platformNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  revalidatePath("/platform/notifications");
}
