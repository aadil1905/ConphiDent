"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function getId(formData: FormData) {
  const id = Number(formData.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function confirmedReason(formData: FormData, action: string) {
  return String(formData.get("confirmed") || "") === "1" ? `${action} after user confirmation` : null;
}

export async function deleteServiceAction(formData: FormData) {
  const owner = await requireOwner();
  const id = getId(formData);
  if (!id) return;

  await prisma.clinicService.deleteMany({ where: { id, clinicId: owner.clinicId } });
  revalidatePath("/dashboard/settings/operations");
}

export async function deleteInventoryItemAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Archived");
  if (!id || !reason) return;

  const item = await prisma.inventoryItem.findFirst({ where: { id, clinicId: user.clinicId, archivedAt: null }, select: { id: true, name: true } });
  if (!item) return;
  await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id: item.id }, data: { active: false, archivedAt: new Date() } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "INVENTORY_ITEM_ARCHIVED", entityType: "INVENTORY_ITEM", entityId: String(item.id), detail: `Archived inventory item ${item.name}; ledger history retained`, reason } }),
  ]);
  revalidatePath("/dashboard/operations");
}

export async function deleteLabCaseAction(formData: FormData) {
  const user = await requirePermission("manageLaboratory");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Cancelled");
  if (!id || !reason) return;

  const item = await prisma.labCase.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null }, select: { id: true, patientId: true } });
  if (!item) return;
  await prisma.$transaction([
    prisma.labCase.update({ where: { id: item.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: item.patientId, actorRole: user.role, action: "LAB_CASE_CANCELLED", entityType: "LAB_CASE", entityId: String(item.id), reason } }),
  ]);
  revalidatePath("/dashboard/operations");
}

export async function deleteLeadAction(formData: FormData) {
  const user = await requirePermission("managePatients");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Closed");
  if (!id || !reason) return;

  const lead = await prisma.lead.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true, fullName: true, stage: true } });
  if (!lead) return;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { stage: "LOST", lossReason: reason } }),
    prisma.leadActivity.create({ data: { leadId: lead.id, type: "LEAD_CLOSED", content: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "LEAD_CLOSED", entityType: "LEAD", entityId: String(lead.id), detail: `Closed lead ${lead.fullName}; CRM history retained`, reason, beforeState: { stage: lead.stage }, afterState: { stage: "LOST" } } }),
  ]);
  revalidatePath("/dashboard/growth");
}

export async function deletePatientAction(formData: FormData) {
  const user = await requirePermission("managePatients");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Archived");
  if (!id || !reason) return;

  const patient = await prisma.patient.findFirst({ where: { id, clinicId: user.clinicId, archivedAt: null }, select: { id: true, fullName: true } });
  if (!patient) return;
  await prisma.$transaction([
    prisma.patient.update({ where: { id: patient.id }, data: { archivedAt: new Date(), archiveReason: reason, archivedByUserId: user.id } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "PATIENT_ARCHIVED", entityType: "PATIENT", entityId: String(patient.id), detail: `Archived patient ${patient.fullName}`, reason } }),
  ]);
  revalidatePath("/dashboard/patients");
}

export async function deleteConversationAction(formData: FormData) {
  const user = await requirePermission("sendWhatsApp");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Archived");
  if (!id || !reason) return;

  const conversation = await prisma.whatsAppConversation.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true, patientId: true, status: true } });
  if (!conversation) return;
  await prisma.$transaction([
    prisma.whatsAppConversation.update({ where: { id: conversation.id }, data: { status: "RESOLVED", automationMode: "HUMAN_ONLY", label: "Archived" } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: conversation.patientId, actorRole: user.role, action: "WHATSAPP_CONVERSATION_ARCHIVED", entityType: "WHATSAPP_CONVERSATION", entityId: String(conversation.id), detail: "Resolved conversation and retained complete message history", reason, beforeState: { status: conversation.status }, afterState: { status: "RESOLVED", automationMode: "HUMAN_ONLY" } } }),
  ]);
  revalidatePath("/dashboard/conversations");
}

export async function deleteFollowUpAction(formData: FormData) {
  const user = await requirePermission("manageSchedule");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Cancelled");
  if (!id || !reason) return;

  const task = await prisma.followUpTask.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true, patientId: true, status: true } });
  if (!task) return;
  await prisma.$transaction([
    prisma.followUpTask.update({ where: { id: task.id }, data: { status: "CANCELLED", cancelledAt: new Date(), outcome: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: task.patientId, actorRole: user.role, action: "FOLLOW_UP_CANCELLED", entityType: "FOLLOW_UP", entityId: String(task.id), detail: "Cancelled follow-up and retained activity history", reason, beforeState: { status: task.status }, afterState: { status: "CANCELLED" } } }),
  ]);
  revalidatePath("/dashboard/growth");
}

export async function deleteTreatmentPlanAction(formData: FormData) {
  const user = await requirePermission("manageClinical");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Cancelled");
  if (!id || !reason) return;

  const plan = await prisma.treatmentPlan.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null }, select: { id: true, patientId: true } });
  if (!plan) return;
  await prisma.$transaction([
    prisma.treatmentPlan.update({ where: { id: plan.id }, data: { status: "Cancelled", cancelledAt: new Date(), cancellationReason: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: plan.patientId, actorRole: user.role, action: "TREATMENT_PLAN_CANCELLED", entityType: "TREATMENT_PLAN", entityId: String(plan.id), reason } }),
  ]);
  revalidatePath("/dashboard/treatment-plans");
}

export async function deleteInvoiceAction(formData: FormData) {
  const user = await requireFeature("billing");
  const id = getId(formData);
  const reason = confirmedReason(formData, "Voided");
  if (!id || !reason) return;

  const invoice = await prisma.invoice.findFirst({ where: { id, clinicId: user.clinicId, voidedAt: null }, select: { id: true, patientId: true, invoiceNumber: true, payments: { where: { status: "POSTED" }, select: { id: true }, take: 1 } } });
  if (!invoice) return;
  if (invoice.payments.length) {
    redirect("/dashboard/billing?error=reverse-payments-before-void");
  }
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Void", voidedAt: new Date(), voidReason: reason } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: invoice.patientId, actorRole: user.role, action: "INVOICE_VOIDED", entityType: "INVOICE", entityId: String(invoice.id), detail: `Voided invoice ${invoice.invoiceNumber}`, reason } }),
  ]);
  revalidatePath("/dashboard/billing");
}
