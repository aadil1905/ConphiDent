"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { canTransitionLabCase, isLabCaseStatus, type LabCaseStatus } from "@/lib/laboratory-core";
import { resolveLabPortalAccess } from "@/lib/laboratory-portal";
import { prisma } from "@/lib/prisma";

export type LabPortalActionState = { ok: boolean; message: string };

function field(formData: FormData, name: string, maximum: number) {
  return String(formData.get(name) || "").trim().slice(0, maximum);
}

function completionDate(formData: FormData) {
  const value = field(formData, "expectedCompletionAt", 40);
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function labPortalCaseAction(token: string, _previous: LabPortalActionState, formData: FormData): Promise<LabPortalActionState> {
  const access = await resolveLabPortalAccess(token);
  if (!access) return { ok: false, message: "This laboratory access link is invalid, expired, or revoked." };
  const action = field(formData, "actionType", 40);
  const body = field(formData, "body", 4000);
  let target: LabCaseStatus | null = null;
  if (action === "ACCEPT") target = "ACCEPTED";
  else if (action === "REJECT") target = "REJECTED";
  else if (action === "CLARIFY") target = "CLARIFICATION_REQUESTED";
  else if (action === "STATUS") {
    const requested = field(formData, "status", 40);
    if (isLabCaseStatus(requested)) target = requested;
  } else if (action !== "MESSAGE") return { ok: false, message: "Choose a supported case action." };

  if (action === "MESSAGE" && body.length < 2) return { ok: false, message: "Write a message before posting." };
  if (["REJECT", "CLARIFY"].includes(action) && body.length < 8) return { ok: false, message: "Explain the rejection or clarification request in at least 8 characters." };
  if (target && (!isLabCaseStatus(access.labCase.status) || !canTransitionLabCase(access.labCase.status, target, "LAB"))) return { ok: false, message: `This case cannot move from ${access.labCase.status.replaceAll("_", " ")} to ${target.replaceAll("_", " ")}. Refresh before retrying.` };
  const expectedCompletionAt = action === "ACCEPT" ? completionDate(formData) : null;
  if (action === "ACCEPT" && !expectedCompletionAt) return { ok: false, message: "Confirm an expected completion date when accepting the case." };
  const materialBatchDetails = field(formData, "materialBatchDetails", 1000);
  const dispatchCarrier = field(formData, "dispatchCarrier", 160);
  const dispatchTrackingNumber = field(formData, "dispatchTrackingNumber", 160);
  const dispatchNotes = field(formData, "dispatchNotes", 1000);
  if (target === "DISPATCHED" && !dispatchCarrier && !dispatchTrackingNumber && dispatchNotes.length < 4) return { ok: false, message: "Record the carrier, tracking reference, or dispatch details before marking the case dispatched." };
  const correlationId = randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      let messageId: string | null = null;
      if (body) {
        const message = await tx.labCaseMessage.create({ data: { clinicId: access.clinicId, labCaseId: access.labCase.id, authorType: "LAB", portalAccessId: access.id, kind: action === "MESSAGE" ? "MESSAGE" : action, body } });
        messageId = message.id;
      }
      if (target) {
        const timestamps = {
          ...(target === "ACCEPTED" ? { acceptedAt: new Date(), expectedCompletionAt } : {}),
          ...(materialBatchDetails ? { materialBatchDetails } : {}),
          ...(target === "DISPATCHED" ? { dispatchedAt: new Date(), dispatchCarrier: dispatchCarrier || null, dispatchTrackingNumber: dispatchTrackingNumber || null, dispatchNotes: dispatchNotes || null } : {}),
        };
        const claimed = await tx.labCase.updateMany({ where: { id: access.labCase.id, clinicId: access.clinicId, status: access.labCase.status }, data: { status: target, ...timestamps, version: { increment: 1 } } });
        if (claimed.count !== 1) throw new Error("The case changed while this update was submitted.");
      }
      const event = await tx.labCaseEvent.create({ data: { clinicId: access.clinicId, labCaseId: access.labCase.id, type: target || "LAB_MESSAGE", actorName: access.contactName || access.laboratory.name, actorType: "LAB", portalAccessId: access.id, fromStatus: target ? access.labCase.status : null, toStatus: target, notes: body || null, metadata: messageId || materialBatchDetails || dispatchCarrier || dispatchTrackingNumber || dispatchNotes ? { messageId, materialBatchDetails: materialBatchDetails || null, dispatchCarrier: dispatchCarrier || null, dispatchTrackingNumber: dispatchTrackingNumber || null, dispatchNotes: dispatchNotes || null } : Prisma.JsonNull } });
      await tx.patientTimelineEvent.create({ data: { clinicId: access.clinicId, patientId: access.labCase.patientId, encounterId: access.labCase.encounterId, eventType: target ? "LAB_STATUS_CHANGED" : "LAB_MESSAGE_RECEIVED", objectType: "LAB_CASE", objectId: String(access.labCase.id), title: target ? `Laboratory case ${target.replaceAll("_", " ").toLowerCase()}` : "Laboratory message received", summary: body || access.labCase.orderNumber, source: "LAB_PORTAL", idempotencyKey: `lab-portal-event:${event.id}` } });
      await tx.auditLog.create({ data: { clinicId: access.clinicId, patientId: access.labCase.patientId, actorRole: "LAB_PORTAL", action: target ? "LAB_STATUS_CHANGED" : "LAB_CASE_MESSAGE_POSTED", entityType: target ? "LAB_CASE" : "LAB_CASE_MESSAGE", entityId: target ? String(access.labCase.id) : messageId, source: "LAB_PORTAL", correlationId, reason: ["REJECT", "CLARIFY"].includes(action) ? body : null, beforeState: target ? { status: access.labCase.status } : Prisma.JsonNull, afterState: target ? { status: target, expectedCompletionAt } : { messageId } } });
      if (["CLARIFICATION_REQUESTED", "REJECTED"].includes(target || "")) {
        const patient = await tx.patient.findFirst({ where: { id: access.labCase.patientId, clinicId: access.clinicId }, select: { id: true, fullName: true, phone: true } });
        if (patient) {
          const existingTask = await tx.followUpTask.findFirst({ where: { clinicId: access.clinicId, sourceType: "LAB_CASE", sourceId: String(access.labCase.id), taskType: "LABORATORY_FOLLOW_UP", status: { in: ["PENDING", "SENT"] } }, select: { id: true } });
          if (!existingTask) await tx.followUpTask.create({ data: { clinicId: access.clinicId, patientId: patient.id, sourceType: "LAB_CASE", sourceId: String(access.labCase.id), priority: "URGENT", patientName: patient.fullName, phone: patient.phone, taskType: "LABORATORY_FOLLOW_UP", message: `Internal action: laboratory ${target === "REJECTED" ? "rejected" : "requested clarification for"} ${access.labCase.orderNumber || `LAB-${access.labCase.id}`}. Review the case thread before contacting the patient.`, metadata: JSON.stringify({ labCaseId: access.labCase.id, status: target }) } });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message.startsWith("The case changed") ? error.message : "The update could not be committed. No partial status or message was saved." };
  }
  revalidatePath(`/lab/cases/${token}`);
  revalidatePath(`/dashboard/laboratory/${access.labCase.id}`);
  revalidatePath(`/dashboard/patients/${access.labCase.patientId}`);
  revalidatePath("/dashboard/huddle");
  return { ok: true, message: target ? `Case updated to ${target.replaceAll("_", " ").toLowerCase()}.` : "Message added to the permanent case thread." };
}
