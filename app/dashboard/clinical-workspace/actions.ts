"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ensureEncounter } from "@/lib/encounters";
import {
  calculateAgeMonths,
  dentitionForFdiCode,
  isFdiAllowedForStage,
  isStandardFdiCode,
  suggestDentitionStage,
  type DentitionStage,
} from "@/lib/dentition";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const conditions = ["HEALTHY", "CARIES", "FILLING", "CROWN", "ROOT_CANAL", "MISSING", "IMPLANT", "WATCH"] as const;
const recordTypes = ["FINDING", "COMPLETED_PROCEDURE"] as const;
const surfaces = ["O", "M", "D", "B", "L"] as const;

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function localDayRange(dayKey: string) {
  return {
    start: new Date(`${dayKey}T00:00:00.000+05:30`),
    end: new Date(`${dayKey}T23:59:59.999+05:30`),
  };
}

function todayKey() {
  return dateKey(new Date());
}

function validStage(value: string): value is Exclude<DentitionStage, "NOT_ASSESSED"> {
  return value === "PRIMARY" || value === "MIXED" || value === "PERMANENT";
}

function findingChanged(
  existing: { condition: string; recordType: string; notes: string | null; surfaces: string[] },
  next: { condition: string; recordType: string; notes: string | null; surfaces: string[] },
) {
  return existing.condition !== next.condition || existing.recordType !== next.recordType ||
    existing.notes !== next.notes || [...existing.surfaces].sort().join(",") !== [...next.surfaces].sort().join(",");
}

export async function saveDentalChartEntryAction(formData: FormData) {
  formData.set("toothNumbers", String(formData.get("toothNumber") || ""));
  return saveDentalChartEntriesAction(formData);
}

export async function saveDentalChartEntriesAction(formData: FormData) {
  const user = await requirePermission("signClinical");
  const patientId = Number(formData.get("patientId"));
  const appointmentId = Number(formData.get("appointmentId")) || null;
  const toothNumbers = Array.from(new Set(
    String(formData.get("toothNumbers") || "").split(",").map((value) => value.trim()).filter(isStandardFdiCode),
  ));
  const condition = String(formData.get("condition") || "HEALTHY") as (typeof conditions)[number];
  const recordType = String(formData.get("recordType") || "FINDING") as (typeof recordTypes)[number];
  const selectedSurfaces = Array.from(new Set(formData.getAll("surfaces").map(String))).filter(
    (value): value is (typeof surfaces)[number] => surfaces.includes(value as (typeof surfaces)[number]),
  );
  const notes = String(formData.get("notes") || "").trim() || null;
  const visitDateInput = String(formData.get("visitDate") || "").trim();
  const stage = String(formData.get("dentitionStage") || "") as DentitionStage;
  const confirmed = String(formData.get("confirmed") || "") === "1";
  const allowNewWorkspace = String(formData.get("allowNewWorkspace") || "") === "1";
  if (!confirmed || !Number.isInteger(patientId) || toothNumbers.length === 0 || !conditions.includes(condition) ||
      !recordTypes.includes(recordType) || !validStage(stage) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(visitDateInput) || toothNumbers.some((tooth) => !isFdiAllowedForStage(tooth, stage))) {
    return { ok: false, message: "Confirm the dentition stage and select valid FDI teeth before saving." };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
    select: { id: true, dateOfBirth: true },
  });
  if (!patient) return { ok: false, message: "Patient was not found in this clinic." };

  const range = localDayRange(visitDateInput);
  const appointment = appointmentId
    ? await prisma.appointment.findFirst({
        where: { id: appointmentId, clinicId: user.clinicId, patientId, status: "Completed", archivedAt: null },
        select: { id: true, appointmentDate: true, providerId: true, locationId: true, chairId: true },
      })
    : await prisma.appointment.findFirst({
        where: { clinicId: user.clinicId, patientId, status: "Completed", archivedAt: null, appointmentDate: { gte: range.start, lte: range.end } },
        orderBy: { appointmentDate: "asc" },
        select: { id: true, appointmentDate: true, providerId: true, locationId: true, chairId: true },
      });
  if (appointment && dateKey(appointment.appointmentDate) !== visitDateInput) {
    return { ok: false, message: "The selected appointment does not match this visit date." };
  }
  if (!appointment && (!allowNewWorkspace || visitDateInput !== todayKey())) {
    return { ok: false, message: "Complete an appointment before charting this visit." };
  }

  const occurredAt = appointment?.appointmentDate ?? range.start;
  const suggestedStage = suggestDentitionStage(patient.dateOfBirth, occurredAt);
  const ageMonths = patient.dateOfBirth ? calculateAgeMonths(patient.dateOfBirth, occurredAt) : null;
  const correlationId = randomUUID();

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const encounter = await ensureEncounter(tx, {
        clinicId: user.clinicId,
        patientId,
        appointmentId: appointment?.id,
        providerId: appointment?.providerId,
        locationId: appointment?.locationId,
        chairId: appointment?.chairId,
        createdById: user.id,
        occurredAt,
        source: appointment ? "APPOINTMENT" : "AD_HOC",
        status: appointment ? "COMPLETED" : "IN_PROGRESS",
      });

      const latestAssessment = await tx.dentitionAssessment.findFirst({
        where: { clinicId: user.clinicId, encounterId: encounter.id },
        orderBy: { version: "desc" },
      });
      if (!latestAssessment || latestAssessment.stage !== stage) {
        await tx.dentitionAssessment.create({
          data: {
            clinicId: user.clinicId,
            patientId,
            encounterId: encounter.id,
            stage,
            suggestedStage,
            ageMonths,
            version: (latestAssessment?.version || 0) + 1,
            confirmedById: user.id,
            correctionReason: latestAssessment ? "Changed after user confirmation" : null,
          },
        });
      }

      let changedCount = 0;
      for (const toothNumber of toothNumbers) {
        const dentition = dentitionForFdiCode(toothNumber);
        if (!dentition) continue;
        const patientTooth = await tx.patientTooth.upsert({
          where: { patientId_dentition_fdiCode: { patientId, dentition, fdiCode: toothNumber } },
          create: { clinicId: user.clinicId, patientId, dentition, fdiCode: toothNumber },
          update: {},
        });
        const existing = await tx.dentalFinding.findFirst({
          where: { clinicId: user.clinicId, patientId, patientToothId: patientTooth.id, status: "ACTIVE" },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        });
        const next = { condition, recordType, notes, surfaces: selectedSurfaces };
        if (existing && !findingChanged(existing, next)) continue;
        if (existing) {
          await tx.dentalFinding.update({
            where: { id: existing.id },
            data: { status: "SUPERSEDED" },
          });
        }
        await tx.dentalFinding.create({
          data: {
            clinicId: user.clinicId,
            patientId,
            encounterId: encounter.id,
            patientToothId: patientTooth.id,
            toothCodeSnapshot: toothNumber,
            recordType,
            condition,
            surfaces: selectedSurfaces,
            notes,
            version: (existing?.version || 0) + 1,
            authorId: user.id,
            signedAt: new Date(),
            correctionReason: existing ? "Changed after user confirmation" : null,
            supersedesId: existing?.id || null,
          },
        });

        const legacy = await tx.dentalChartEntry.findFirst({
          where: { clinicId: user.clinicId, patientId, toothNumber, visitDate: { gte: range.start, lte: range.end } },
        });
        if (legacy) {
          await tx.dentalChartEntry.update({
            where: { id: legacy.id },
            data: { encounterId: encounter.id, authorId: user.id, condition, notes, visitDate: occurredAt, status: "CURRENT", version: { increment: 1 } },
          });
        } else {
          await tx.dentalChartEntry.create({
            data: { clinicId: user.clinicId, patientId, encounterId: encounter.id, authorId: user.id, toothNumber, condition, notes, visitDate: occurredAt },
          });
        }
        changedCount += 1;
      }

      if (changedCount > 0) {
        const event = await tx.patientTimelineEvent.create({
          data: {
            clinicId: user.clinicId,
            patientId,
            encounterId: encounter.id,
            actorId: user.id,
            eventType: "DENTAL_CHART_SIGNED",
            objectType: "Encounter",
            objectId: String(encounter.id),
            title: `${changedCount} dental chart entr${changedCount === 1 ? "y" : "ies"} signed`,
            summary: `${stage.replace("_", " ")} · ${recordType.replace("_", " ")} · ${condition}`,
            idempotencyKey: `chart-${correlationId}`,
            occurredAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            clinicId: user.clinicId,
            userId: user.id,
            patientId,
            actorRole: user.role,
            action: "DENTAL_CHART_SIGNED",
            entityType: "PatientTimelineEvent",
            entityId: String(event.id),
            detail: `Signed ${changedCount} FDI chart entr${changedCount === 1 ? "y" : "ies"} for encounter ${encounter.id}`,
            correlationId,
            reason: "Saved after user confirmation",
            afterState: { stage, toothNumbers, condition, recordType, surfaces: selectedSurfaces },
          },
        });
      }
      return changedCount;
    });

    revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
    revalidatePath(`/dashboard/patients/${patientId}`);
    return { ok: true, message: saved ? `${saved} chart entr${saved === 1 ? "y" : "ies"} signed.` : "No clinical changes to save." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The chart could not be saved." };
  }
}

export async function clearVisitDentalWorkspaceAction(formData: FormData) {
  const user = await requirePermission("correctClinical");
  const patientId = Number(formData.get("patientId"));
  const visitDateInput = String(formData.get("visitDate") || "").trim();
  const reason = "Visit chart marked entered in error after user confirmation";
  if (!Number.isInteger(patientId) || !/^\d{4}-\d{2}-\d{2}$/.test(visitDateInput) || formData.get("confirmed") !== "1") return;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
    select: { id: true },
  });
  if (!patient) return;
  const range = localDayRange(visitDateInput);
  const encounters = await prisma.encounter.findMany({
    where: { clinicId: user.clinicId, patientId, occurredAt: { gte: range.start, lte: range.end } },
    select: { id: true },
  });
  const encounterIds = encounters.map((item) => item.id);
  const correlationId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const [findings, legacyEntries, records] = await Promise.all([
      encounterIds.length ? tx.dentalFinding.updateMany({
        where: { clinicId: user.clinicId, patientId, encounterId: { in: encounterIds }, status: "ACTIVE" },
        data: { status: "ENTERED_IN_ERROR", correctionReason: reason },
      }) : Promise.resolve({ count: 0 }),
      tx.dentalChartEntry.updateMany({
        where: { clinicId: user.clinicId, patientId, visitDate: { gte: range.start, lte: range.end }, status: "CURRENT" },
        data: { status: "ENTERED_IN_ERROR" },
      }),
      tx.clinicalRecord.updateMany({
        where: { clinicId: user.clinicId, patientId, chiefComplaint: { startsWith: "Tooth " }, visitDate: { gte: range.start, lte: range.end }, enteredInErrorAt: null },
        data: { status: "ENTERED_IN_ERROR", enteredInErrorAt: new Date(), enteredInErrorReason: reason },
      }),
    ]);
    await tx.patientTimelineEvent.create({
      data: {
        clinicId: user.clinicId,
        patientId,
        encounterId: encounterIds[0] || null,
        actorId: user.id,
        eventType: "CLINICAL_DATA_ENTERED_IN_ERROR",
        objectType: "Encounter",
        objectId: String(encounterIds[0] || visitDateInput),
        title: "Visit chart marked entered in error",
        summary: reason,
        idempotencyKey: `entered-in-error-${correlationId}`,
      },
    });
    await tx.auditLog.create({
      data: {
        clinicId: user.clinicId,
        userId: user.id,
        patientId,
        actorRole: user.role,
        action: "CLINICAL_DATA_ENTERED_IN_ERROR",
        entityType: "Encounter",
        entityId: String(encounterIds[0] || visitDateInput),
        detail: `Retained and marked ${findings.count + legacyEntries.count + records.count} records entered in error`,
        reason,
        correlationId,
        beforeState: { visitDate: visitDateInput },
        afterState: { status: "ENTERED_IN_ERROR" },
      },
    });
  });

  revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
  revalidatePath(`/dashboard/patients/${patientId}`);
}
