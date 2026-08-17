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
    const [findings, legacyEntries] = await Promise.all([
      encounterIds.length ? tx.dentalFinding.updateMany({
        where: { clinicId: user.clinicId, patientId, encounterId: { in: encounterIds }, status: "ACTIVE" },
        data: { status: "ENTERED_IN_ERROR", correctionReason: reason },
      }) : Promise.resolve({ count: 0 }),
      tx.dentalChartEntry.updateMany({
        where: { clinicId: user.clinicId, patientId, visitDate: { gte: range.start, lte: range.end }, status: "CURRENT" },
        data: { status: "ENTERED_IN_ERROR" },
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
        detail: `Retained and marked ${findings.count + legacyEntries.count} chart entries entered in error`,
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

/**
 * Undo the chart entries that were just signed.
 *
 * The Clinical Depth brief asks for undo on every chart action, and this file's
 * own sibling — the confirm dialog — already states the house rule: anything
 * reversible gets an optimistic update and an Undo on the toast rather than a
 * question in front of it. The chart was the one place that took a clinical
 * write with no way back short of "mark the whole visit entered in error".
 *
 * Nothing is deleted. Signed clinical data is append-only, so this walks the
 * version chain the save already built: the entry that was just written is
 * marked ENTERED_IN_ERROR and whatever it superseded is made ACTIVE again. A
 * tooth that had nothing before simply returns to unrecorded. The correction is
 * timestamped, attributed and audited like every other amendment.
 *
 * Scoped to this clinician's own most recent entry per tooth on this encounter,
 * so an undo can never reach past a colleague who charted the same tooth in
 * between — it will report that it found nothing to undo instead.
 */
export async function undoDentalChartEntriesAction(formData: FormData) {
  const user = await requirePermission("signClinical");
  const patientId = Number(formData.get("patientId"));
  const visitDateInput = String(formData.get("visitDate") || "").trim();
  const toothNumbers = String(formData.get("toothNumbers") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(isStandardFdiCode);

  if (!Number.isInteger(patientId) || !/^\d{4}-\d{2}-\d{2}$/.test(visitDateInput) || !toothNumbers.length) {
    return { ok: false, message: "There was nothing to undo." };
  }

  const range = localDayRange(visitDateInput);
  const correlationId = randomUUID();

  try {
    const undone = await prisma.$transaction(async (tx) => {
      const encounters = await tx.encounter.findMany({
        where: { clinicId: user.clinicId, patientId, occurredAt: { gte: range.start, lte: range.end } },
        select: { id: true },
      });
      const encounterIds = encounters.map((item) => item.id);
      if (!encounterIds.length) return 0;

      let count = 0;
      for (const toothNumber of toothNumbers) {
        const current = await tx.dentalFinding.findFirst({
          where: {
            clinicId: user.clinicId,
            patientId,
            encounterId: { in: encounterIds },
            toothCodeSnapshot: toothNumber,
            status: "ACTIVE",
            authorId: user.id,
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        });
        if (!current) continue;

        await tx.dentalFinding.update({
          where: { id: current.id },
          data: {
            status: "ENTERED_IN_ERROR",
            correctionReason: "Undone by the clinician who signed it, moments after signing",
          },
        });

        const previous = current.supersedesId
          ? await tx.dentalFinding.findFirst({ where: { id: current.supersedesId, clinicId: user.clinicId } })
          : null;
        if (previous) {
          await tx.dentalFinding.update({ where: { id: previous.id }, data: { status: "ACTIVE" } });
        }

        // The legacy whole-tooth mirror has no version chain of its own, so it
        // is put back by hand from whatever the finding chain says is true now.
        const legacy = await tx.dentalChartEntry.findFirst({
          where: { clinicId: user.clinicId, patientId, toothNumber, visitDate: { gte: range.start, lte: range.end } },
        });
        if (legacy) {
          await tx.dentalChartEntry.update({
            where: { id: legacy.id },
            data: previous
              ? { condition: previous.condition, notes: previous.notes, status: "CURRENT" }
              : { status: "ENTERED_IN_ERROR" },
          });
        }
        count += 1;
      }

      if (count > 0) {
        const event = await tx.patientTimelineEvent.create({
          data: {
            clinicId: user.clinicId,
            patientId,
            encounterId: encounterIds[0],
            actorId: user.id,
            eventType: "DENTAL_CHART_UNDONE",
            objectType: "Encounter",
            objectId: String(encounterIds[0]),
            title: `${count} dental chart entr${count === 1 ? "y" : "ies"} undone`,
            summary: `Teeth ${toothNumbers.join(", ")} put back as they were`,
            idempotencyKey: `chart-undo-${correlationId}`,
            occurredAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            clinicId: user.clinicId,
            userId: user.id,
            patientId,
            actorRole: user.role,
            action: "DENTAL_CHART_UNDONE",
            entityType: "PatientTimelineEvent",
            entityId: String(event.id),
            detail: `Undid ${count} FDI chart entr${count === 1 ? "y" : "ies"} on encounter ${encounterIds[0]}`,
            correlationId,
            reason: "Undone after user action",
            afterState: { toothNumbers, status: "ENTERED_IN_ERROR" },
          },
        });
      }
      return count;
    });

    revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
    revalidatePath(`/dashboard/patients/${patientId}`);
    return undone > 0
      ? { ok: true, message: `${undone} entr${undone === 1 ? "y" : "ies"} put back.` }
      : { ok: false, message: "That has already been changed since — nothing was undone." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "That could not be undone." };
  }
}

export type ToothHistoryEntry = {
  id: string;
  at: string;
  kind: "FOUND" | "DID" | "PLANNED" | "XRAY" | "MARKED" | "LAB";
  headline: string;
  detail: string | null;
  by: string | null;
  /** Superseded or withdrawn entries stay visible — the trail is the point. */
  state: "CURRENT" | "AMENDED" | "WITHDRAWN";
};

/**
 * Everything that ever referenced one tooth, newest first.
 *
 * "What did we do to 36 and when" is the question the brief wants answered in
 * one tap, and today it is answered by memory or by scrolling four screens.
 * Six tables reference a tooth and all six are read here: what was found and
 * what was done (`DentalFinding`, including every superseded version, so the
 * amendment trail is visible rather than implied), what is planned
 * (`TreatmentPlanTooth`), which radiographs include it (`ImagingStudy.toothCodes`),
 * what was marked on one (`ImagingAnnotation.toothCode`), and what went to the
 * lab for it (`LabCase.teeth`).
 *
 * Read-only, and permission-gated the same way the chart it sits in is.
 */
export async function toothHistoryAction(patientId: number, toothNumber: string) {
  const user = await requirePermission("signClinical");
  if (!Number.isInteger(patientId) || !isStandardFdiCode(toothNumber)) {
    return { ok: false as const, entries: [] as ToothHistoryEntry[] };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
    select: { id: true },
  });
  if (!patient) return { ok: false as const, entries: [] as ToothHistoryEntry[] };

  const [findings, legacyEntries, planned, studies, marks, labCases] = await Promise.all([
    prisma.dentalFinding.findMany({
      where: { clinicId: user.clinicId, patientId, toothCodeSnapshot: toothNumber },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        author: { select: { fullName: true } },
        encounter: { select: { occurredAt: true } },
      },
    }),
    // `DentalChartEntry` is described elsewhere as a legacy mirror of
    // `DentalFinding`. Against the live clinic it is not: 29 of its 38 rows
    // have no finding at all — crowns, root canals and fillings that exist
    // nowhere else. Reading findings alone would show a tooth as untouched
    // while the chart beside it draws a crown on it.
    prisma.dentalChartEntry.findMany({
      where: { clinicId: user.clinicId, patientId, toothNumber },
      orderBy: { visitDate: "desc" },
      take: 60,
      include: { author: { select: { fullName: true } } },
    }),
    prisma.treatmentPlanTooth.findMany({
      where: { toothNumber, treatmentPlan: { clinicId: user.clinicId, patientId } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { treatmentPlan: { select: { id: true, title: true, status: true, visitDate: true, cancelledAt: true } } },
    }),
    prisma.imagingStudy.findMany({
      where: { clinicId: user.clinicId, patientId, archivedAt: null, toothCodes: { has: toothNumber } },
      orderBy: { acquisitionDate: "desc" },
      take: 30,
      select: { id: true, modality: true, description: true, acquisitionDate: true, status: true },
    }),
    prisma.imagingAnnotation.findMany({
      where: { clinicId: user.clinicId, toothCode: toothNumber, study: { patientId } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { author: { select: { fullName: true } }, study: { select: { modality: true } } },
    }),
    prisma.labCase.findMany({
      where: { clinicId: user.clinicId, patientId, teeth: { contains: toothNumber } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, caseType: true, status: true, orderNumber: true, createdAt: true },
    }),
  ]);

  // A legacy row is only shown when no finding covers the same tooth on the
  // same day, so a tooth charted since the newer table arrived is not listed
  // twice.
  const dayKey = (value: Date) => dateKey(value);
  const coveredDays = new Set(
    findings.map((finding) => dayKey(finding.encounter?.occurredAt ?? finding.createdAt)),
  );
  // The legacy row carries a condition but no record type, so it cannot say
  // whether the tooth was found like this or treated like this. The chart
  // itself reads those same conditions as one or the other, and this follows it.
  const TREATED = new Set(["FILLING", "CROWN", "ROOT_CANAL", "IMPLANT", "MISSING"]);

  const entries: ToothHistoryEntry[] = [
    ...legacyEntries
      .filter((row) => !coveredDays.has(dayKey(row.visitDate)))
      .map((row) => ({
        id: `legacy-${row.id}`,
        at: row.visitDate.toISOString(),
        kind: (TREATED.has(row.condition) ? "DID" : "FOUND") as ToothHistoryEntry["kind"],
        headline: row.condition.replaceAll("_", " ").toLowerCase(),
        detail: row.notes,
        by: row.author?.fullName ?? null,
        state: (row.status === "CURRENT" ? "CURRENT" : "WITHDRAWN") as ToothHistoryEntry["state"],
      })),
    ...findings.map((finding) => ({
      id: `finding-${finding.id}`,
      at: (finding.encounter?.occurredAt ?? finding.createdAt).toISOString(),
      kind: (finding.recordType === "COMPLETED_PROCEDURE" ? "DID" : "FOUND") as ToothHistoryEntry["kind"],
      headline: finding.condition.replaceAll("_", " ").toLowerCase(),
      detail: [
        finding.surfaces.length ? `surfaces ${finding.surfaces.join(", ")}` : null,
        finding.notes,
      ].filter(Boolean).join(" · ") || null,
      by: finding.author?.fullName ?? null,
      state: (finding.status === "ACTIVE"
        ? "CURRENT"
        : finding.status === "ENTERED_IN_ERROR"
          ? "WITHDRAWN"
          : "AMENDED") as ToothHistoryEntry["state"],
    })),
    ...planned.map((row) => ({
      id: `plan-${row.id}`,
      at: (row.treatmentPlan.visitDate ?? row.createdAt).toISOString(),
      kind: "PLANNED" as const,
      headline: row.treatmentPlan.title,
      detail: row.treatmentPlan.status,
      by: null,
      state: (row.treatmentPlan.cancelledAt ? "WITHDRAWN" : "CURRENT") as ToothHistoryEntry["state"],
    })),
    ...studies.map((study) => ({
      id: `study-${study.id}`,
      at: study.acquisitionDate.toISOString(),
      kind: "XRAY" as const,
      headline: study.modality,
      detail: study.description,
      by: null,
      state: "CURRENT" as const,
    })),
    ...marks.map((mark) => ({
      id: `mark-${mark.id}`,
      at: mark.createdAt.toISOString(),
      kind: "MARKED" as const,
      headline: mark.label,
      detail: `marked on the ${mark.study.modality}`,
      by: mark.author?.fullName ?? null,
      state: (mark.status === "ACTIVE" ? "CURRENT" : "WITHDRAWN") as ToothHistoryEntry["state"],
    })),
    ...labCases.map((labCase) => ({
      id: `lab-${labCase.id}`,
      at: labCase.createdAt.toISOString(),
      kind: "LAB" as const,
      headline: labCase.caseType,
      detail: [labCase.orderNumber, labCase.status].filter(Boolean).join(" · ") || null,
      by: null,
      state: "CURRENT" as const,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));

  return { ok: true as const, entries };
}
