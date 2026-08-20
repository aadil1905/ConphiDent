"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { createAndSendIntakeLink } from "@/lib/patient-intake-link";

const addPatientSchema = z.object({
  fullName: z.string().trim().min(2, "We need a name to put on the file.").max(160),
  phone: z
    .string()
    .transform((value) => value.replace(/\D/g, "").slice(-10))
    .pipe(z.string().length(10, "A mobile number is 10 digits.")),
  age: z.union([z.literal(""), z.coerce.number().int().min(0).max(120)]).optional(),
  flag: z.string().trim().max(300).optional().default(""),
  sendIntake: z.boolean().default(false),
});

export type AddPatientResult =
  | { ok: true; patientId: number; note: string }
  | { ok: false; message: string; field?: "fullName" | "phone" | "age" };

/**
 * Four fields now — the rest can wait until they are in the chair. An age is
 * kept as an approximate birthday because that is all the front desk is told.
 */
export async function addPatientAction(input: unknown): Promise<AddPatientResult> {
  const parsed = addPatientSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message || "Check the highlighted boxes and try again.",
      field: issue?.path[0] as AddPatientResult extends { field?: infer F } ? F : never,
    };
  }

  const user = await requirePermission("managePatients");
  const { fullName, phone, age, flag, sendIntake } = parsed.data;

  try {
    const patient = await prisma.patient.create({
      data: {
        clinicId: user.clinicId,
        fullName,
        phone,
        dateOfBirth:
          typeof age === "number" ? new Date(new Date().getFullYear() - age, 0, 1) : null,
        medicalNotes: flag || null,
      },
      select: { id: true, fullName: true, phone: true },
    });

    let note = `${fullName.split(" ")[0]} is on your list.`;
    if (sendIntake && (await hasFeature(user.clinicId, "whatsapp"))) {
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
      note = sent.warning
        ? `${note} The form did not go out — ${sent.warning}`
        : `${note} The form is on its way to them on WhatsApp.`;
    }

    revalidatePath("/dashboard/patients");
    return { ok: true, patientId: patient.id, note };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.patient.findUnique({
        where: { clinicId_phone: { clinicId: user.clinicId, phone } },
        select: { id: true, fullName: true },
      });
      return {
        ok: false,
        field: "phone",
        message: existing
          ? `${existing.fullName} already has that number. Open their file instead.`
          : "That number is already on someone's file.",
      };
    }
    return {
      ok: false,
      message: "That didn't save — your connection dropped. Nothing was lost; try again.",
    };
  }
}
