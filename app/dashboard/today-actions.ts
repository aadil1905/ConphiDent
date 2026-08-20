"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

/**
 * Everything the Today queue can do, and the exact opposite of each, so the
 * 8-second Undo on the toast is a real reversal rather than a fresh guess.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const OFFLINE = "That didn't save — your connection dropped. Nothing was lost; try again.";

/** The three screens that read the callback queue, refreshed together. */
function revalidateQueues() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/huddle");
  revalidatePath("/dashboard/growth");
}

export async function markArrivedAction(appointmentId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    const changed = await prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null, status: { notIn: ["Cancelled"] } },
      data: { status: "Confirmed" },
    });
    if (!changed.count) return { ok: false, message: "That visit has moved on — refresh to see where it is now." };
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function undoArrivedAction(appointmentId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    await prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null, status: "Confirmed" },
      data: { status: "Pending" },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function closeFollowUpAction(taskId: number, outcome: string): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    const changed = await prisma.followUpTask.updateMany({
      where: {
        id: taskId,
        clinicId: user.clinicId,
        status: { in: ["PENDING", "QUEUED", "SENT", "FAILED"] },
      },
      data: { status: "COMPLETED", outcome: outcome.slice(0, 80), completedAt: new Date() },
    });
    if (!changed.count) return { ok: false, message: "Someone else closed that one already." };
    revalidateQueues();
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function reopenFollowUpAction(taskId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    await prisma.followUpTask.updateMany({
      where: { id: taskId, clinicId: user.clinicId, status: "COMPLETED" },
      data: { status: "PENDING", outcome: null, completedAt: null },
    });
    revalidateQueues();
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/**
 * Puts a name against a callback so the morning brief can say who is ringing
 * whom. `null` hands it back to nobody in particular.
 */
export async function assignFollowUpAction(
  taskId: number,
  assignedUserId: number | null,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    if (assignedUserId !== null) {
      const assignee = await prisma.user.findFirst({
        where: { id: assignedUserId, clinicId: user.clinicId, active: true },
        select: { id: true },
      });
      if (!assignee) return { ok: false, message: "That person is no longer on the team." };
    }
    const changed = await prisma.followUpTask.updateMany({
      where: { id: taskId, clinicId: user.clinicId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      data: { assignedUserId },
    });
    if (!changed.count) return { ok: false, message: "That call is already closed." };
    revalidateQueues();
    return { ok: true };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
