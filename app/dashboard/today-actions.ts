"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

/**
 * The chair stepper's three moves — arrive, complete, and the undo that makes
 * the 8-second toast a real reversal rather than a fresh guess.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const OFFLINE = "That didn't save — your connection dropped. Nothing was lost; try again.";

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

export async function markCompletedAction(appointmentId: number): Promise<ActionResult> {
  try {
    const user = await requirePermission("manageSchedule");
    const changed = await prisma.appointment.updateMany({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null, status: { notIn: ["Cancelled", "Completed"] } },
      data: { status: "Completed" },
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


