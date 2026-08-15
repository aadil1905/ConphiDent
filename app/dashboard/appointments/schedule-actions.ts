"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { STATUS_VALUES } from "@/lib/visit-status";

export type StatusResult = { ok: true; previous: string } | { ok: false; message: string };

/**
 * One status change, with the value it replaced handed back so the toast can
 * offer a real Undo rather than guessing.
 */
export async function setVisitStatusAction(
  appointmentId: number,
  status: string,
): Promise<StatusResult> {
  if (!STATUS_VALUES.includes(status)) {
    return { ok: false, message: "That is not a status a visit can be in." };
  }
  try {
    const user = await requirePermission("manageSchedule");
    const current = await prisma.appointment.findFirst({
      where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
      select: { status: true },
    });
    if (!current) return { ok: false, message: "That visit has moved — refresh to see where it is now." };

    await prisma.appointment.update({ where: { id: appointmentId }, data: { status } });
    revalidatePath("/dashboard/appointments");
    revalidatePath("/dashboard");
    return { ok: true, previous: current.status };
  } catch {
    return { ok: false, message: "That didn't save — your connection dropped. Nothing was lost; try again." };
  }
}
