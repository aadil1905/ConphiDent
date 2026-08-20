"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { decryptLabPortalToken, encryptLabPortalToken, generateLabPortalToken, hashLabPortalToken } from "@/lib/laboratory-access-core";
import { labPortalUrl, laboratoryAccessSecret } from "@/lib/laboratory-access";
import { canTransitionLabCase, isLabCaseStatus, labOrderIssues, splitLabList } from "@/lib/laboratory-core";
import { isStandardFdiCode } from "@/lib/dentition";
import { requirePermission } from "@/lib/permissions";
import { prisma, type Db } from "@/lib/prisma";

const listPath = "/dashboard/laboratory";
export type LaboratoryActionState = { ok: boolean; message: string; caseId?: number; secureUrl?: string };

function text(formData: FormData, name: string, maximum: number) {
  return String(formData.get(name) || "").trim().slice(0, maximum);
}

function id(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function date(formData: FormData, name: string) {
  const value = text(formData, name, 40);
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function percent(formData: FormData, name: string) {
  const raw = text(formData, name, 16);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : Number.NaN;
}

function refreshCase(caseId: number, patientId?: number | null) {
  revalidatePath(listPath);
  revalidatePath(`${listPath}/${caseId}`);
  revalidatePath("/dashboard");
  if (patientId) revalidatePath(`/dashboard/patients/${patientId}`);
}

function html(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function refreshLaboratoryMetrics(tx: Db, clinicId: number, labId: number | null) {
  if (!labId) return;
  const cases = await tx.labCase.findMany({ where: { clinicId, labId, status: { notIn: ["DRAFT", "APPROVED", "CANCELLED"] } }, select: { parentCaseId: true, status: true, dueDate: true, receivedAt: true, deliveredAt: true } });
  if (!cases.length) return;
  const reworks = cases.filter((item) => item.parentCaseId !== null || item.status === "REWORK").length;
  const delivered = cases.filter((item) => item.receivedAt || item.deliveredAt);
  const onTime = delivered.filter((item) => item.dueDate && (item.receivedAt || item.deliveredAt)! <= item.dueDate).length;
  await tx.laboratory.updateMany({ where: { id: labId, clinicId }, data: { remakeRate: Math.round((reworks / cases.length) * 1000) / 10, ...(delivered.length ? { onTimeDeliveryRate: Math.round((onTime / delivered.length) * 1000) / 10 } : {}) } });
}

async function sendLabEmail(input: { attemptId: string; to: string; labName: string; clinicName: string; orderNumber: string; secureUrl: string }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Secure email delivery is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `lab-delivery-${input.attemptId}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [input.to],
      subject: `${input.clinicName}: laboratory case ${input.orderNumber}`,
      html: `<p>Hello ${html(input.labName)},</p><p>${html(input.clinicName)} has assigned laboratory case <strong>${html(input.orderNumber)}</strong>.</p><p>Open the secure, expiring portal link below to review the minimum necessary case information, accept the case, request clarification, and post production updates.</p><p><a href="${html(input.secureUrl)}">Open secure laboratory case</a></p><p>Do not forward this link. No patient name or contact information is included in this email.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Secure email delivery failed with status ${response.status}.`);
}

export async function createLabCaseAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const patientId = id(formData, "patientId");
  const labId = id(formData, "labId");
  const treatmentPlanId = id(formData, "treatmentPlanId");
  const treatmentPlanItemId = id(formData, "treatmentPlanItemId");
  const appointmentId = id(formData, "appointmentId");
  const providerId = id(formData, "providerId");
  const caseType = text(formData, "caseType", 160);
  const idempotencyKey = text(formData, "idempotencyKey", 100);
  if (!patientId || !labId || !caseType || idempotencyKey.length < 16) return { ok: false, message: "Choose the patient, laboratory, procedure, and retry the form if its request identifier is missing." };

  const toothCodes = splitLabList(formData.get("teeth"), 32);
  if (toothCodes.some((code) => !isStandardFdiCode(code))) return { ok: false, message: "Use valid two-digit FDI tooth numbers, separated by commas." };
  const [patient, laboratory, treatmentPlan, treatmentPlanItem, appointment, provider] = await Promise.all([
    prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, fullName: true } }),
    prisma.laboratory.findFirst({ where: { id: labId, clinicId: user.clinicId, active: true, archivedAt: null } }),
    treatmentPlanId ? prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, patientId, cancelledAt: null }, select: { id: true, encounterId: true, providerId: true } }) : null,
    treatmentPlanItemId ? prisma.treatmentPlanItem.findFirst({ where: { id: treatmentPlanItemId, treatmentPlan: { clinicId: user.clinicId, patientId, cancelledAt: null, ...(treatmentPlanId ? { id: treatmentPlanId } : {}) } }, select: { id: true, treatmentPlanId: true, name: true } }) : null,
    appointmentId ? prisma.appointment.findFirst({ where: { id: appointmentId, clinicId: user.clinicId, patientId, archivedAt: null }, select: { id: true, appointmentDate: true } }) : null,
    providerId ? prisma.clinicProvider.findFirst({ where: { id: providerId, clinicId: user.clinicId, active: true }, select: { id: true, name: true } }) : null,
  ]);
  if (!patient || !laboratory) return { ok: false, message: "The selected patient or laboratory is not available in this clinic." };
  if ((treatmentPlanId && !treatmentPlan) || (treatmentPlanItemId && !treatmentPlanItem) || (appointmentId && !appointment) || (providerId && !provider)) return { ok: false, message: "The selected plan, item, appointment, or dentist is outside this patient and clinic." };
  if (treatmentPlanId && treatmentPlanItem && treatmentPlanItem.treatmentPlanId !== treatmentPlanId) return { ok: false, message: "The selected treatment item is not part of this treatment plan." };

  const existing = await prisma.labCase.findUnique({ where: { idempotencyKey }, select: { id: true, clinicId: true } });
  if (existing) return existing.clinicId === user.clinicId ? { ok: true, message: "This order was already created safely.", caseId: existing.id } : { ok: false, message: "The request identifier is unavailable. Reload the form and retry." };

  const correlationId = randomUUID();
  const orderNumber = `LAB-${new Date().getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const labCase = await tx.labCase.create({ data: {
        clinicId: user.clinicId,
        patientId,
        patientSafeIdentifier: `CASE-${randomBytes(5).toString("hex").toUpperCase()}`,
        treatmentPlanId: treatmentPlan?.id || treatmentPlanItem?.treatmentPlanId || null,
        treatmentPlanItemId: treatmentPlanItem?.id || null,
        encounterId: treatmentPlan?.encounterId || null,
        appointmentId: appointment?.id || null,
        patientAppointmentAt: appointment?.appointmentDate || date(formData, "patientAppointmentAt"),
        providerId: provider?.id || treatmentPlan?.providerId || null,
        authorId: user.id,
        labId: laboratory.id,
        labName: laboratory.name,
        caseType,
        restorationType: text(formData, "restorationType", 160) || null,
        status: "DRAFT",
        dueDate: date(formData, "dueDate"),
        notes: text(formData, "notes", 4000) || null,
        orderNumber,
        idempotencyKey,
        teeth: toothCodes.join(", ") || null,
        anatomicalScope: text(formData, "anatomicalScope", 240) || null,
        priority: ["NORMAL", "URGENT"].includes(text(formData, "priority", 20)) ? text(formData, "priority", 20) : "NORMAL",
        treatingDoctor: provider?.name || text(formData, "doctor", 160) || user.fullName,
        technicianName: text(formData, "technician", 160) || laboratory.technicianName || null,
        labPhone: laboratory.phone,
        labWhatsapp: laboratory.whatsapp,
        shade: text(formData, "shade", 80) || null,
        shadeSystem: text(formData, "shadeSystem", 120) || null,
        material: text(formData, "material", 160) || null,
        marginType: text(formData, "marginType", 160) || null,
        marginDesign: text(formData, "marginDesign", 160) || null,
        ponticDesign: text(formData, "ponticDesign", 160) || null,
        occlusionNotes: text(formData, "occlusionNotes", 1000) || null,
        biteNotes: text(formData, "biteNotes", 1000) || null,
        implantSystem: text(formData, "implantSystem", 160) || null,
        implantComponents: text(formData, "implantComponents", 500) || null,
        requestedStages: formData.getAll("requestedStages").map(String).filter(Boolean).slice(0, 12),
        pickupRequired: formData.get("pickupRequired") === "1",
        pickupInstructions: text(formData, "pickupInstructions", 500) || null,
        previousCaseReference: text(formData, "previousCaseReference", 160) || null,
      } });
      await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: "CREATED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, toStatus: "DRAFT", notes: "Laboratory order created as a draft.", idempotencyKey: `lab-created:${labCase.publicId}` } });
      await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId, encounterId: labCase.encounterId, actorId: user.id, eventType: "LAB_ORDER_CREATED", objectType: "LAB_CASE", objectId: String(labCase.id), title: "Laboratory order created", summary: `${orderNumber} · ${caseType} · draft`, idempotencyKey: `lab-created:${labCase.publicId}` } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId, actorRole: user.role, action: "LAB_ORDER_CREATED", entityType: "LAB_CASE", entityId: String(labCase.id), correlationId, afterState: { orderNumber, status: "DRAFT", labId: laboratory.id, treatmentPlanId: labCase.treatmentPlanId, treatmentPlanItemId: labCase.treatmentPlanItemId } } });
      return labCase;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    refreshCase(created.id, patientId);
    return { ok: true, message: "Draft laboratory order created. Review and approve it before transmission.", caseId: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.labCase.findFirst({ where: { clinicId: user.clinicId, idempotencyKey }, select: { id: true } });
      if (duplicate) return { ok: true, message: "This order was already created safely.", caseId: duplicate.id };
    }
    return { ok: false, message: "The order could not be committed. No partial laboratory case was retained." };
  }
}

export async function saveLaboratoryAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const name = text(formData, "name", 200);
  const turnaround = Number(text(formData, "defaultTurnaroundDays", 8));
  const qualityScore = percent(formData, "qualityScore");
  const remakeRate = percent(formData, "remakeRate");
  const onTimeDeliveryRate = percent(formData, "onTimeDeliveryRate");
  if (!name) return { ok: false, message: "Laboratory display name is required." };
  if ([qualityScore, remakeRate, onTimeDeliveryRate].some(Number.isNaN)) return { ok: false, message: "Quality metrics must be percentages from 0 to 100." };
  if (turnaround && (!Number.isInteger(turnaround) || turnaround < 1 || turnaround > 365)) return { ok: false, message: "Turnaround must be between 1 and 365 days." };
  const communication = text(formData, "preferredCommunication", 40);
  const integrationType = text(formData, "integrationType", 40);
  const lab = await prisma.laboratory.upsert({
    where: { clinicId_name: { clinicId: user.clinicId, name } },
    create: {
      clinicId: user.clinicId,
      name,
      legalName: text(formData, "legalName", 240) || null,
      contactName: text(formData, "contactName", 160) || null,
      technicianName: text(formData, "technicianName", 160) || null,
      technicians: splitLabList(formData.get("technicians"), 30),
      phone: text(formData, "phone", 40) || null,
      whatsapp: text(formData, "whatsapp", 40) || null,
      email: text(formData, "email", 254) || null,
      address: text(formData, "address", 1000) || null,
      gstNumber: text(formData, "gstNumber", 40) || null,
      services: text(formData, "services", 1000) || null,
      supportedServices: splitLabList(formData.get("services"), 50),
      materials: splitLabList(formData.get("materials"), 50),
      defaultTurnaroundDays: turnaround || null,
      pickupSchedule: text(formData, "pickupSchedule", 500) || null,
      deliverySchedule: text(formData, "deliverySchedule", 500) || null,
      taxInformation: text(formData, "taxInformation", 1000) || null,
      preferredCommunication: ["SECURE_LINK", "SECURE_EMAIL", "WHATSAPP_LINK", "PRINT"].includes(communication) ? communication : "SECURE_LINK",
      integrationType: ["SECURE_PORTAL", "LAB_API", "SECURE_EMAIL", "MANUAL_PRINT"].includes(integrationType) ? integrationType : "SECURE_PORTAL",
      qualityScore,
      remakeRate,
      onTimeDeliveryRate,
      dataProcessingNotes: text(formData, "dataProcessingNotes", 1500) || null,
      dataProcessingAcceptedAt: formData.get("dataProcessingAccepted") === "1" ? new Date() : null,
      notes: text(formData, "notes", 2000) || null,
    },
    update: {
      legalName: text(formData, "legalName", 240) || null,
      contactName: text(formData, "contactName", 160) || null,
      technicianName: text(formData, "technicianName", 160) || null,
      technicians: splitLabList(formData.get("technicians"), 30),
      phone: text(formData, "phone", 40) || null,
      whatsapp: text(formData, "whatsapp", 40) || null,
      email: text(formData, "email", 254) || null,
      address: text(formData, "address", 1000) || null,
      gstNumber: text(formData, "gstNumber", 40) || null,
      services: text(formData, "services", 1000) || null,
      supportedServices: splitLabList(formData.get("services"), 50),
      materials: splitLabList(formData.get("materials"), 50),
      defaultTurnaroundDays: turnaround || null,
      pickupSchedule: text(formData, "pickupSchedule", 500) || null,
      deliverySchedule: text(formData, "deliverySchedule", 500) || null,
      taxInformation: text(formData, "taxInformation", 1000) || null,
      preferredCommunication: ["SECURE_LINK", "SECURE_EMAIL", "WHATSAPP_LINK", "PRINT"].includes(communication) ? communication : "SECURE_LINK",
      integrationType: ["SECURE_PORTAL", "LAB_API", "SECURE_EMAIL", "MANUAL_PRINT"].includes(integrationType) ? integrationType : "SECURE_PORTAL",
      qualityScore,
      remakeRate,
      onTimeDeliveryRate,
      dataProcessingNotes: text(formData, "dataProcessingNotes", 1500) || null,
      dataProcessingAcceptedAt: formData.get("dataProcessingAccepted") === "1" ? new Date() : null,
      notes: text(formData, "notes", 2000) || null,
      active: true,
      archivedAt: null,
    },
  });
  await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "LABORATORY_DIRECTORY_SAVED", entityType: "LABORATORY", entityId: String(lab.id), afterState: { name: lab.name, integrationType: lab.integrationType, active: lab.active } } });
  revalidatePath(listPath);
  return { ok: true, message: "Laboratory directory record saved." };
}

export async function archiveLaboratoryAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const laboratoryId = id(formData, "id");
  const reason = "Archived after user confirmation";
  if (!laboratoryId || formData.get("confirmed") !== "1") return { ok: false, message: "Confirm the laboratory archive." };
  const lab = await prisma.laboratory.findFirst({ where: { id: laboratoryId, clinicId: user.clinicId, active: true }, select: { id: true, name: true } });
  if (!lab) return { ok: false, message: "The laboratory is not available in this clinic." };
  await prisma.$transaction([
    prisma.laboratory.update({ where: { id: lab.id }, data: { active: false, archivedAt: new Date() } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "LABORATORY_ARCHIVED", entityType: "LABORATORY", entityId: String(lab.id), reason, beforeState: { active: true }, afterState: { active: false } } }),
  ]);
  revalidatePath(listPath);
  return { ok: true, message: "Laboratory archived. Existing case history was preserved." };
}

export async function approveLabCaseAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("approveLabOrder");
  const caseId = id(formData, "caseId");
  const attested = formData.get("approvalAttestation") === "1";
  if (!caseId || !attested) return { ok: false, message: "The responsible dentist must review and attest to this work authorization." };
  const labCase = await prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId, status: { in: ["DRAFT", "REWORK"] }, cancelledAt: null } });
  if (!labCase) return { ok: false, message: "This draft is no longer available for approval." };
  const issues = labOrderIssues(labCase);
  if (issues.length) return { ok: false, message: issues.join(" ") };
  const correlationId = randomUUID();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.labCase.updateMany({ where: { id: labCase.id, clinicId: user.clinicId, status: labCase.status }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, approvalStatement: "Reviewed and approved for minimum-necessary laboratory transmission.", version: { increment: 1 } } });
    if (claimed.count !== 1) throw new Error("The order changed while it was being approved.");
    await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: "APPROVED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, fromStatus: labCase.status, toStatus: "APPROVED", notes: "Dentist work authorization approved.", idempotencyKey: `lab-approved:${labCase.publicId}:v${labCase.version + 1}` } });
    await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: labCase.patientId, encounterId: labCase.encounterId, actorId: user.id, eventType: "LAB_ORDER_APPROVED", objectType: "LAB_CASE", objectId: String(labCase.id), title: "Laboratory order approved", summary: `${labCase.orderNumber || `LAB-${labCase.id}`} · ready for secure transmission`, idempotencyKey: `lab-approved:${labCase.publicId}:v${labCase.version + 1}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: labCase.patientId, actorRole: user.role, action: "LAB_ORDER_APPROVED", entityType: "LAB_CASE", entityId: String(labCase.id), correlationId, beforeState: { status: labCase.status, version: labCase.version }, afterState: { status: "APPROVED", version: labCase.version + 1 } } });
  });
  refreshCase(labCase.id, labCase.patientId);
  return { ok: true, message: "Order approved. It is still private until you create or send a secure lab link." };
}

export async function transitionLabCaseAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const caseId = id(formData, "caseId");
  const target = text(formData, "status", 40);
  const reason = "Status changed after user confirmation";
  if (!caseId || !isLabCaseStatus(target)) return { ok: false, message: "Choose a supported laboratory status." };
  const labCase = await prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId, cancelledAt: null } });
  if (!labCase || !isLabCaseStatus(labCase.status)) return { ok: false, message: "The laboratory case is not available." };
  if (!canTransitionLabCase(labCase.status, target, "CLINIC")) return { ok: false, message: `The clinic cannot move this case from ${labCase.status.replaceAll("_", " ")} to ${target.replaceAll("_", " ")}.` };
  if (["CANCELLED", "REWORK"].includes(target) && formData.get("confirmed") !== "1") return { ok: false, message: "Confirm the cancellation or rework." };
  const timestamps = {
    ...(target === "RECEIVED_BY_CLINIC" ? { receivedAt: new Date(), deliveredAt: new Date() } : {}),
    ...(target === "FITTED" ? { fittedAt: new Date() } : {}),
    ...(target === "COMPLETED" ? { completedAt: new Date() } : {}),
    ...(target === "CANCELLED" ? { cancelledAt: new Date(), cancellationReason: reason } : {}),
  };
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.labCase.updateMany({ where: { id: labCase.id, clinicId: user.clinicId, status: labCase.status }, data: { status: target, ...timestamps, version: { increment: 1 } } });
    if (claimed.count !== 1) throw new Error("The case changed concurrently.");
    const event = await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: target, actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, fromStatus: labCase.status, toStatus: target, notes: reason || null } });
    await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: labCase.patientId, encounterId: labCase.encounterId, actorId: user.id, eventType: "LAB_STATUS_CHANGED", objectType: "LAB_CASE", objectId: String(labCase.id), title: `Laboratory case ${target.replaceAll("_", " ").toLowerCase()}`, summary: reason || labCase.orderNumber, idempotencyKey: `lab-event:${event.id}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: labCase.patientId, actorRole: user.role, action: "LAB_STATUS_CHANGED", entityType: "LAB_CASE", entityId: String(labCase.id), reason: reason || null, beforeState: { status: labCase.status }, afterState: { status: target } } });
    if (["RECEIVED_BY_CLINIC", "FITTED", "COMPLETED", "REWORK"].includes(target)) await refreshLaboratoryMetrics(tx, user.clinicId, labCase.labId);
  });
  refreshCase(labCase.id, labCase.patientId);
  return { ok: true, message: `Case moved to ${target.replaceAll("_", " ").toLowerCase()}.` };
}

export async function postClinicLabMessageAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const caseId = id(formData, "caseId");
  const body = text(formData, "body", 4000);
  if (!caseId || body.length < 2) return { ok: false, message: "Write a case message before posting." };
  const labCase = await prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId }, select: { id: true, patientId: true, encounterId: true } });
  if (!labCase) return { ok: false, message: "The laboratory case is not available." };
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.labCaseMessage.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, authorType: "CLINIC", authorUserId: user.id, body } });
    await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: "CLINIC_MESSAGE", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, notes: body.slice(0, 500), idempotencyKey: `lab-message:${created.id}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: labCase.patientId, actorRole: user.role, action: "LAB_CASE_MESSAGE_POSTED", entityType: "LAB_CASE_MESSAGE", entityId: created.id, detail: "Clinic message added to the permanent laboratory case thread." } });
    return created;
  });
  refreshCase(labCase.id, labCase.patientId);
  return { ok: true, message: `Message ${message.id.slice(-6)} added to the permanent case thread.` };
}

export async function linkLabImagingAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const caseId = id(formData, "caseId");
  const imagingStudyId = text(formData, "imagingStudyId", 80);
  const purpose = text(formData, "purpose", 40) || "REFERENCE";
  if (!caseId || !imagingStudyId) return { ok: false, message: "Choose an imaging study to link." };
  const [labCase, study] = await Promise.all([
    prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId }, select: { id: true, patientId: true, encounterId: true } }),
    prisma.imagingStudy.findFirst({ where: { id: imagingStudyId, clinicId: user.clinicId, patientId: { not: null }, archivedAt: null, enteredInErrorAt: null }, select: { id: true, patientId: true, modality: true } }),
  ]);
  if (!labCase || !study || study.patientId !== labCase.patientId) return { ok: false, message: "The case and imaging study must belong to the same patient and clinic." };
  try {
    await prisma.$transaction(async (tx) => {
      const link = await tx.labCaseImagingStudy.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, imagingStudyId: study.id, purpose: ["REFERENCE", "SHADE", "DESIGN", "PRE_TREATMENT", "POST_TREATMENT"].includes(purpose) ? purpose : "REFERENCE" } });
      await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: "IMAGING_LINKED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, notes: `${study.modality.replaceAll("_", " ")} linked without copying the original study.`, idempotencyKey: `lab-imaging:${link.id}` } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: labCase.patientId, actorRole: user.role, action: "LAB_IMAGING_LINKED", entityType: "LAB_CASE", entityId: String(labCase.id), afterState: { imagingStudyId: study.id, purpose } } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: true, message: "That imaging study is already linked to the case." };
    return { ok: false, message: "The imaging reference could not be linked." };
  }
  refreshCase(labCase.id, labCase.patientId);
  return { ok: true, message: "Imaging linked by reference; no duplicate clinical file was created." };
}

export async function issueLabDeliveryAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("manageLaboratory");
  const caseId = id(formData, "caseId");
  const channel = text(formData, "channel", 40);
  const idempotencyKey = text(formData, "idempotencyKey", 120);
  const approvedMinimum = formData.get("minimumNecessaryConfirmed") === "1";
  if (!caseId || !["SECURE_LINK", "SECURE_EMAIL", "WHATSAPP_LINK"].includes(channel) || idempotencyKey.length < 16 || !approvedMinimum) return { ok: false, message: "Choose a secure delivery method and confirm the minimum-necessary disclosure." };
  const labCase = await prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId, status: { in: ["APPROVED", "QUEUED", "SENT", "DELIVERED_TO_ENDPOINT", "VIEWED", "CLARIFICATION_REQUESTED"] }, cancelledAt: null }, include: { laboratory: true, clinic: { select: { name: true, brandName: true } } } });
  if (!labCase?.laboratory) return { ok: false, message: "This approved order has no active laboratory directory record." };
  if (channel === "SECURE_EMAIL" && !labCase.laboratory.email) return { ok: false, message: "Add a laboratory email address before secure email delivery." };
  if (channel === "WHATSAPP_LINK" && !labCase.laboratory.whatsapp) return { ok: false, message: "Add the laboratory WhatsApp number before queueing a secure-link notification." };

  const secret = laboratoryAccessSecret();
  let rawToken = "";
  let attemptId = "";
  let portalAccessId = "";
  const prior = await prisma.labDeliveryAttempt.findUnique({ where: { idempotencyKey }, include: { portalAccess: true } });
  if (prior) {
    if (prior.clinicId !== user.clinicId || prior.labCaseId !== labCase.id || !prior.portalAccess) return { ok: false, message: "The delivery request identifier is unavailable. Reload and retry." };
    rawToken = decryptLabPortalToken(secret, prior.portalAccess.tokenCiphertext);
    attemptId = prior.id;
    portalAccessId = prior.portalAccess.id;
  } else {
    rawToken = generateLabPortalToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const created = await prisma.$transaction(async (tx) => {
      await tx.labPortalAccess.updateMany({ where: { clinicId: user.clinicId, labCaseId: labCase.id, revokedAt: null }, data: { revokedAt: new Date() } });
      const access = await tx.labPortalAccess.create({ data: { clinicId: user.clinicId, laboratoryId: labCase.laboratory!.id, labCaseId: labCase.id, tokenHash: hashLabPortalToken(rawToken), tokenCiphertext: encryptLabPortalToken(secret, rawToken), contactName: labCase.laboratory!.contactName || labCase.laboratory!.technicianName, expiresAt } });
      const whatsappOutbox = channel === "WHATSAPP_LINK" ? await tx.scheduledWhatsAppMessage.create({ data: { clinicId: user.clinicId, phone: labCase.laboratory!.whatsapp!, content: `${labCase.clinic.brandName || labCase.clinic.name}: secure laboratory case ${labCase.orderNumber || `LAB-${labCase.id}`}. Open the expiring, authenticated case link: ${labPortalUrl(rawToken)}. Do not forward this link. No patient name or contact details are included.`, messageType: "LAB_SECURE_LINK", scheduledAt: new Date(), createdByUserId: user.id } }) : null;
      const queued = channel !== "SECURE_LINK";
      const attempt = await tx.labDeliveryAttempt.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, portalAccessId: access.id, whatsappOutboxId: whatsappOutbox?.id || null, channel, endpointMasked: channel === "SECURE_EMAIL" ? labCase.laboratory!.email!.replace(/(^.).*(@.*$)/, "$1***$2") : channel === "WHATSAPP_LINK" ? labCase.laboratory!.whatsapp!.replace(/.(?=.{4})/g, "*") : "Secure link prepared", status: queued ? "QUEUED" : "PREPARED", idempotencyKey } });
      if (queued && labCase.status === "APPROVED") await tx.labCase.update({ where: { id: labCase.id }, data: { status: "QUEUED", version: { increment: 1 } } });
      await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: queued ? "DELIVERY_QUEUED" : "SECURE_LINK_PREPARED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, portalAccessId: access.id, fromStatus: labCase.status, toStatus: queued && labCase.status === "APPROVED" ? "QUEUED" : labCase.status, notes: channel === "WHATSAPP_LINK" ? "Secure-link WhatsApp notification added to the durable clinic outbox; no clinical attachment or patient identity was included." : "Minimum-necessary secure laboratory portal access issued.", idempotencyKey: `lab-delivery:${attempt.id}` } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: labCase.patientId, actorRole: user.role, action: "LAB_PORTAL_ACCESS_ISSUED", entityType: "LAB_CASE", entityId: String(labCase.id), detail: `${channel}; token stored hashed and encrypted; expires ${expiresAt.toISOString()}`, afterState: { channel, status: attempt.status, portalAccessId: access.id } } });
      return { access, attempt };
    });
    attemptId = created.attempt.id;
    portalAccessId = created.access.id;
  }

  const secureUrl = labPortalUrl(rawToken);
  if (channel === "SECURE_EMAIL") {
    try {
      await prisma.labDeliveryAttempt.update({ where: { id: attemptId }, data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: new Date(), failureReason: null } });
      await sendLabEmail({ attemptId, to: labCase.laboratory.email!, labName: labCase.laboratory.name, clinicName: labCase.clinic.brandName || labCase.clinic.name, orderNumber: labCase.orderNumber || `LAB-${labCase.id}`, secureUrl });
      await prisma.$transaction(async (tx) => {
        await tx.labDeliveryAttempt.update({ where: { id: attemptId }, data: { status: "SENT", sentAt: new Date(), failureReason: null } });
        const latest = await tx.labCase.findFirst({ where: { id: labCase.id, clinicId: user.clinicId }, select: { status: true, version: true } });
        if (latest && ["APPROVED", "QUEUED", "CLARIFICATION_REQUESTED"].includes(latest.status)) {
          await tx.labCase.update({ where: { id: labCase.id }, data: { status: "SENT", version: { increment: 1 } } });
          await tx.labCaseEvent.create({ data: { clinicId: user.clinicId, labCaseId: labCase.id, type: "SENT", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, portalAccessId, fromStatus: latest.status, toStatus: "SENT", notes: "Secure email accepted by the delivery endpoint.", idempotencyKey: `lab-sent:${attemptId}` } });
        }
      });
      refreshCase(labCase.id, labCase.patientId);
      return { ok: true, message: "Secure email sent. Sent is not treated as laboratory acceptance; portal viewing and acceptance are tracked separately.", secureUrl };
    } catch (error) {
      await prisma.labDeliveryAttempt.update({ where: { id: attemptId }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 500) : "Secure email delivery failed." } }).catch(() => undefined);
      refreshCase(labCase.id, labCase.patientId);
      return { ok: false, message: "Secure email was not confirmed. The order remains retryable and the portal link was not marked accepted.", secureUrl };
    }
  }
  if (channel === "WHATSAPP_LINK") {
    refreshCase(labCase.id, labCase.patientId);
    return { ok: true, message: "A patient-safe laboratory portal link was queued in the durable WhatsApp outbox. Queued is not treated as sent, viewed, or accepted.", secureUrl };
  }
  refreshCase(labCase.id, labCase.patientId);
  return { ok: true, message: "A revocable, 30-day secure portal link was prepared. Creating the link does not mark the case sent or accepted.", secureUrl };
}

export async function createReworkAction(_previous: LaboratoryActionState, formData: FormData): Promise<LaboratoryActionState> {
  const user = await requirePermission("approveLabOrder");
  const caseId = id(formData, "caseId");
  const reason = "Rework created after user confirmation";
  const responsibility = text(formData, "responsibility", 80);
  const promisedDate = date(formData, "dueDate");
  const idempotencyKey = text(formData, "idempotencyKey", 120);
  if (!caseId || formData.get("confirmed") !== "1" || !promisedDate || !["CLINIC", "LABORATORY", "SHARED", "UNDETERMINED"].includes(responsibility) || idempotencyKey.length < 16) return { ok: false, message: "Confirm the rework, responsibility, and new promised date." };
  const original = await prisma.labCase.findFirst({ where: { id: caseId, clinicId: user.clinicId, status: { in: ["RECEIVED_BY_CLINIC", "FITTED", "COMPLETED", "REJECTED", "DELIVERED"] } }, include: { imagingLinks: true } });
  if (!original) return { ok: false, message: "This case is not eligible for a rework version." };
  const duplicate = await prisma.labCase.findUnique({ where: { idempotencyKey }, select: { id: true, clinicId: true } });
  if (duplicate) return duplicate.clinicId === user.clinicId ? { ok: true, message: "This rework version already exists.", caseId: duplicate.id } : { ok: false, message: "Reload the case and retry." };
  const rework = await prisma.$transaction(async (tx) => {
    const updatedOriginal = await tx.labCase.update({ where: { id: original.id }, data: { status: "REWORK", reworkCount: { increment: 1 }, version: { increment: 1 } } });
    const created = await tx.labCase.create({ data: {
      clinicId: original.clinicId, patientId: original.patientId, patientSafeIdentifier: original.patientSafeIdentifier, treatmentPlanId: original.treatmentPlanId, treatmentPlanItemId: original.treatmentPlanItemId, encounterId: original.encounterId, appointmentId: original.appointmentId, providerId: original.providerId, authorId: user.id,
      labName: original.labName, labId: original.labId, caseType: original.caseType, restorationType: original.restorationType, dueDate: promisedDate, patientAppointmentAt: original.patientAppointmentAt, notes: original.notes,
      orderNumber: `${original.orderNumber || `LAB-${original.id}`}-R${updatedOriginal.reworkCount}`, idempotencyKey, teeth: original.teeth, anatomicalScope: original.anatomicalScope, priority: original.priority,
      treatingDoctor: original.treatingDoctor, assistant: original.assistant, technicianName: original.technicianName, labPhone: original.labPhone, labWhatsapp: original.labWhatsapp, shade: original.shade, shadeSystem: original.shadeSystem,
      material: original.material, marginType: original.marginType, marginDesign: original.marginDesign, ponticDesign: original.ponticDesign, occlusionNotes: original.occlusionNotes, biteNotes: original.biteNotes, implantSystem: original.implantSystem, implantComponents: original.implantComponents,
      requestedStages: original.requestedStages, pickupRequired: original.pickupRequired, pickupInstructions: original.pickupInstructions, previousCaseReference: original.orderNumber, attachments: original.attachments,
      status: "DRAFT", version: original.version + 1, parentCaseId: original.parentCaseId || original.id, reworkReason: reason, reworkChargeable: formData.get("chargeable") === "1", reworkResponsibility: responsibility, reworkCount: updatedOriginal.reworkCount,
    } });
    if (original.imagingLinks.length) await tx.labCaseImagingStudy.createMany({ data: original.imagingLinks.map((link) => ({ clinicId: original.clinicId, labCaseId: created.id, imagingStudyId: link.imagingStudyId, purpose: link.purpose })), skipDuplicates: true });
    await tx.labCaseEvent.createMany({ data: [
      { clinicId: user.clinicId, labCaseId: original.id, type: "REWORK_CREATED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, fromStatus: original.status, toStatus: "REWORK", notes: reason, idempotencyKey: `lab-rework-parent:${created.publicId}` },
      { clinicId: user.clinicId, labCaseId: created.id, type: "REWORK_DRAFT_CREATED", actorName: user.fullName, actorType: "CLINIC", actorUserId: user.id, toStatus: "DRAFT", notes: `${responsibility}; ${formData.get("chargeable") === "1" ? "chargeable" : "not chargeable"}; ${reason}`, idempotencyKey: `lab-rework-child:${created.publicId}` },
    ] });
    await tx.patientTimelineEvent.create({ data: { clinicId: user.clinicId, patientId: original.patientId, encounterId: original.encounterId, actorId: user.id, eventType: "LAB_REWORK_CREATED", objectType: "LAB_CASE", objectId: String(created.id), title: "Laboratory rework created", summary: `${created.orderNumber} · ${reason.slice(0, 240)}`, idempotencyKey: `lab-rework:${created.publicId}` } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: original.patientId, actorRole: user.role, action: "LAB_REWORK_CREATED", entityType: "LAB_CASE", entityId: String(created.id), reason, beforeState: { originalCaseId: original.id, originalStatus: original.status }, afterState: { reworkCaseId: created.id, status: "DRAFT", responsibility, chargeable: formData.get("chargeable") === "1", promisedDate } } });
    await refreshLaboratoryMetrics(tx, user.clinicId, original.labId);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  refreshCase(original.id, original.patientId);
  refreshCase(rework.id, rework.patientId);
  return { ok: true, message: "A new rework draft was created; the original history remains immutable.", caseId: rework.id };
}
