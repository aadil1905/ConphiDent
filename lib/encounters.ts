import type { Prisma } from "@prisma/client";

type EncounterInput = {
  clinicId: number;
  patientId: number;
  appointmentId?: number | null;
  providerId?: number | null;
  locationId?: number | null;
  chairId?: number | null;
  createdById: number;
  occurredAt: Date;
  source?: "APPOINTMENT" | "AD_HOC" | "IMPORT";
  status?: "IN_PROGRESS" | "COMPLETED";
};

/**
 * Resolve one stable clinical episode. Call only after the patient and optional
 * appointment have been verified against the authenticated clinic.
 */
export async function ensureEncounter(tx: Prisma.TransactionClient, input: EncounterInput) {
  if (input.appointmentId) {
    const existing = await tx.encounter.findUnique({ where: { appointmentId: input.appointmentId } });
    if (existing) {
      if (existing.clinicId !== input.clinicId || existing.patientId !== input.patientId) {
        throw new Error("Encounter tenant boundary mismatch");
      }
      return existing;
    }
  } else {
    // Every save on the same day reuses one episode, whatever state it is in,
    // so a note and a prescription written an hour apart stay together.
    const existing = await tx.encounter.findFirst({
      where: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        appointmentId: null,
        archivedAt: null,
        occurredAt: input.occurredAt,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
  }

  return tx.encounter.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      appointmentId: input.appointmentId || null,
      providerId: input.providerId || null,
      locationId: input.locationId || null,
      chairId: input.chairId || null,
      createdById: input.createdById,
      occurredAt: input.occurredAt,
      source: input.source || (input.appointmentId ? "APPOINTMENT" : "AD_HOC"),
      status: input.status || "IN_PROGRESS",
      completedAt: input.status === "COMPLETED" ? input.occurredAt : null,
    },
  });
}
