import Link from "next/link";
import { ClinicOnboardingWizard } from "@/components/platform/ClinicOnboardingWizard";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";
import {
  createClinicAction,
  preflightClinicProvisioningAction,
  saveClinicProvisioningDraftAction,
} from "../../actions";
import { PlatformPageHeader } from "@/components/platform/PlatformPrimitives";
import { ProvisioningDraftDashboard } from "@/components/platform/ProvisioningDraftDashboard";

export default async function ProvisionClinicPage({
  searchParams,
}: {
  searchParams: Promise<{
    draft?: string;
    error?: string;
    draftState?: string;
  }>;
}) {
  const admin = await requirePlatformPermission("tenant.create");
  const params = await searchParams;
  const [plans, storedDrafts] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.platformProvisioningDraft.findMany({
      where: { ownerUserId: admin.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const selected = params.draft
    ? storedDrafts.find(
        (draft) =>
          draft.id === params.draft &&
          ["ACTIVE", "PREFLIGHTED"].includes(draft.status),
      )
    : undefined;
  const readData = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const normalized = selected
    ? Object.fromEntries(
        Object.entries(readData(selected.data))
          .filter(
            ([key, value]) =>
              !key.startsWith("_") &&
              (typeof value === "string" || Array.isArray(value)),
          )
          .map(([key, value]) => [
            key,
            Array.isArray(value) ? value.map(String) : String(value),
          ]),
      )
    : undefined;
  const required = [
    "name",
    "ownerName",
    "ownerEmail",
    "brandName",
    "locationName",
    "timezone",
    "serviceName",
    "featureKey",
    "subscriptionStatus",
    "slug",
  ];
  const drafts = storedDrafts.map((draft) => {
    const data = readData(draft.data);
    const complete = required.filter(
      (key) =>
        data[key] &&
        (!Array.isArray(data[key]) || (data[key] as unknown[]).length),
    ).length;
    const status =
      draft.status === "ARCHIVED" ||
      draft.status === "DISCARDED" ||
      draft.status === "ACTIVATING"
        ? draft.status
        : "ACTIVE";
    return {
      id: draft.id,
      name: String(data.name || data.brandName || "Untitled clinic draft"),
      updatedAt: draft.updatedAt.toISOString(),
      percent: Math.round((complete / required.length) * 100),
      status,
    } as const;
  });
  const errorMessage =
    params.error === "draft-confirmation"
      ? "Discard requires a reason and the exact word DISCARD."
      : params.error === "draft-not-found"
        ? "That draft is unavailable, inactive, or belongs to another operator."
        : params.error === "activation-confirmation"
          ? "Activation requires an active saved draft, acknowledgement, and the exact word ACTIVATE."
          : params.error === "activation-in-progress"
            ? "This draft is already activating or no longer available. Refresh before retrying."
            : params.error === "preflight-required"
              ? "Configuration changed after preflight. Re-run server preflight before activation."
              : params.error === "conflict"
                ? "Activation found a conflicting workspace key or owner email. The draft remains safe for correction."
                : params.error === "slug"
                  ? "That workspace key is already in use."
                  : params.error === "email"
                    ? "That owner email already has an account."
                    : params.error
                      ? "Activation validation failed. Review each required step and try again."
                      : "";
  return (
    <main className="space-y-6 pb-12">
      <PlatformPageHeader
        eyebrow="Clinics / Provision clinic"
        title="Provision a clinic"
        description="Complete the guided deployment workflow. Non-secret progress can be saved safely."
        actions={
          <Link
            href="/platform/clinics"
            className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold"
          >
            View tenant directory
          </Link>
        }
      />
      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3 text-sm font-semibold text-[var(--danger)]"
        >
          {errorMessage}
        </p>
      )}
      {params.draftState && (
        <p
          role="status"
          className="rounded-xl border border-[var(--success-border)] bg-[var(--success-bg)] p-3 text-sm font-semibold text-[var(--success)]"
        >
          Draft {params.draftState} successfully.
        </p>
      )}
      <ProvisioningDraftDashboard drafts={drafts} />
      <ClinicOnboardingWizard
        action={createClinicAction}
        saveDraft={saveClinicProvisioningDraftAction}
        preflight={preflightClinicProvisioningAction}
        plans={plans}
        initialDraft={
          selected && normalized
            ? {
                draftId: selected.id,
                values: normalized,
                updatedAt: selected.updatedAt.toISOString(),
                step: selected.currentStep,
              }
            : undefined
        }
      />
    </main>
  );
}
