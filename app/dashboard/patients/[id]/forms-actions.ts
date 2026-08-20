"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { createAndSendIntakeLink } from "@/lib/patient-intake-link";

export type SendFormResult = { ok: true; note: string } | { ok: false; message: string };

/** Sends the patient a fresh 7-day link from the Forms and consent card. */
export async function sendIntakeLinkAction(patientId: number): Promise<SendFormResult> {
  try {
    const user = await requirePermission("managePatients");
    if (!(await hasFeature(user.clinicId, "whatsapp"))) {
      return { ok: false, message: "WhatsApp is switched off for this clinic, so the link cannot go out." };
    }

    const patient = await prisma.patient.findFirst({
      where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
      select: { id: true, fullName: true, phone: true },
    });
    if (!patient) return { ok: false, message: "We could not find that patient." };

    const sent = await createAndSendIntakeLink({
      clinicId: user.clinicId,
      clinicName: user.clinic.brandName || user.clinic.name,
      patientId: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      actorUserId: user.id,
      actorRole: user.role,
      consentConfirmed: true,
    });

    revalidatePath(`/dashboard/patients/${patientId}`);
    const firstName = patient.fullName.split(" ")[0];
    return sent.warning
      ? { ok: false, message: `The link did not go out — ${sent.warning}` }
      : {
          ok: true,
          note: `Link sent to ${firstName} on WhatsApp. You will see it here the moment they sign.`,
        };
  } catch {
    return {
      ok: false,
      message: "That didn't send — your connection dropped. Nothing was lost; try again.",
    };
  }
}
