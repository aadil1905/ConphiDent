"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export type PlanResult = { ok: true } | { ok: false; message: string };

/**
 * "Completed" from the list row, without opening the plan. Narrow on purpose:
 * the full edit PATCH (app/api/treatment-plans/[id]/route.ts) re-derives
 * dentitionStage from the request body and defaults it to NOT_ASSESSED when
 * absent, so reusing it here with a status-only payload would have silently
 * wiped a plan's dentition stage. This only ever touches status.
 */
export async function markTreatmentPlanCompletedAction(planId: number): Promise<PlanResult> {
  try {
    const user = await requirePermission("manageClinical");
    const plan = await prisma.treatmentPlan.findFirst({
      where: { id: planId, clinicId: user.clinicId, cancelledAt: null },
      select: { id: true, patientId: true, status: true },
    });
    if (!plan) return { ok: false, message: "That plan is gone or already cancelled." };
    if (plan.status === "Completed") return { ok: true };

    await prisma.$transaction(async (tx) => {
      // clinicId rides along so the tenant guard sees a scoped write instead
      // of logging tenant.unverified-row-write — same shape as the sign-in
      // writes in app/login/actions.ts.
      await tx.treatmentPlan.update({ where: { id: planId, clinicId: user.clinicId }, data: { status: "Completed" } });
      await tx.auditLog.create({
        data: {
          clinicId: user.clinicId,
          userId: user.id,
          patientId: plan.patientId,
          actorRole: user.role,
          action: "TREATMENT_PLAN_COMPLETED",
          entityType: "TREATMENT_PLAN",
          entityId: String(planId),
          detail: "Marked completed from the Treatment plans list",
        },
      });
    });

    revalidatePath("/dashboard/treatment-plans");
    revalidatePath(`/dashboard/patients/${plan.patientId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "That didn't save — your connection dropped. Nothing was lost; try again." };
  }
}
