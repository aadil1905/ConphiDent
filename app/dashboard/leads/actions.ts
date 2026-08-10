"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const leadsPath = "/dashboard/leads";
const stages = ["NEW", "CONTACTED", "BOOKED", "VISITED", "CONVERTED", "LOST"];

export async function saveLeadAction(formData: FormData) {
  const user = await requireUser();
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").replace(/\D/g, "");
  if (!fullName || phone.length < 10) return;
  const source = String(formData.get("source") || "Manual");
  const serviceInterest = String(formData.get("serviceInterest") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const lead = await prisma.lead.upsert({
    where: { clinicId_phone: { clinicId: user.clinicId, phone } },
    create: { clinicId: user.clinicId, ownerId: user.id, fullName, phone, email, source, serviceInterest, notes, activities: { create: { type: "LEAD_CREATED", content: `Lead added from ${source}` } } },
    update: { fullName, email, source, serviceInterest, notes },
  });
  await prisma.leadActivity.create({ data: { leadId: lead.id, type: "LEAD_UPDATED", content: "Lead details updated" } });
  revalidatePath(leadsPath);
}

export async function updateLeadAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const stage = String(formData.get("stage") || "NEW");
  // A conversion must create or link a real patient record.  Keep the stage
  // update action from producing orphaned "CONVERTED" leads.
  if (!Number.isInteger(id) || !stages.includes(stage) || stage === "CONVERTED") return;
  const lossReason = String(formData.get("lossReason") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const followUp = String(formData.get("nextFollowUpAt") || "");
  const nextFollowUpAt = followUp ? new Date(followUp) : null;
  const conversionValueInput = String(formData.get("conversionValue") || "").trim();
  const conversionValueNumber = Number(conversionValueInput);
  const ownerIdInput = String(formData.get("ownerId") || "");
  const ownerId = ownerIdInput ? Number(ownerIdInput) : null;
  const existing = await prisma.lead.findFirst({ where: { id, clinicId: user.clinicId }, select: { stage: true } });
  if (!existing) return;
  const contactStages = ["CONTACTED", "BOOKED", "VISITED", "CONVERTED"];
  const recovered = existing.stage === "LOST" && stage !== "LOST";
  const validOwner = ownerId ? await prisma.user.findFirst({ where: { id: ownerId, clinicId: user.clinicId, active: true }, select: { id: true } }) : null;
  const result = await prisma.lead.updateMany({ where: { id, clinicId: user.clinicId }, data: { stage, ownerId: validOwner?.id ?? null, lossReason: stage === "LOST" ? lossReason : null, notes, nextFollowUpAt, lastContactedAt: contactStages.includes(stage) ? new Date() : undefined, recoveredAt: recovered ? new Date() : undefined, conversionValue: stage === "CONVERTED" && Number.isFinite(conversionValueNumber) && conversionValueNumber >= 0 ? Math.round(conversionValueNumber) : undefined } });
  if (result.count) {
    await prisma.leadActivity.create({ data: { leadId: id, type: "STAGE_CHANGED", content: `Lead moved to ${stage}` } });
    if (recovered) await prisma.leadActivity.create({ data: { leadId: id, type: "LEAD_RECOVERED", content: "Lead was recovered from Lost" } });
  }
  revalidatePath(leadsPath);
}

export async function convertLeadToPatientAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id, clinicId: user.clinicId },
      select: { id: true, clinicId: true, fullName: true, phone: true, email: true, patientId: true },
    });
    if (!lead) return;

    const existingPatient = lead.patientId
      ? await tx.patient.findFirst({ where: { id: lead.patientId, clinicId: user.clinicId }, select: { id: true } })
      : await tx.patient.findUnique({ where: { clinicId_phone: { clinicId: user.clinicId, phone: lead.phone } }, select: { id: true } });
    const patient = existingPatient ?? await tx.patient.create({
      data: { clinicId: lead.clinicId, fullName: lead.fullName, phone: lead.phone, email: lead.email },
      select: { id: true },
    });

    await tx.lead.update({
      where: { id: lead.id },
      data: { patientId: patient.id, stage: "CONVERTED", nextFollowUpAt: null, lastContactedAt: new Date() },
    });
    await tx.whatsAppConversation.updateMany({
      where: { clinicId: user.clinicId, phone: lead.phone },
      data: { patientId: patient.id, leadId: lead.id },
    });
    await tx.leadActivity.create({
      data: { leadId: lead.id, type: "LEAD_CONVERTED", content: `Lead converted to patient #${patient.id}` },
    });
  });

  revalidatePath(leadsPath);
  revalidatePath("/dashboard/patients");
  revalidatePath("/dashboard/conversations");
}

export async function recoverLostLeadAction(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  const result = await prisma.lead.updateMany({
    where: { id, clinicId: user.clinicId, stage: "LOST" },
    data: { stage: "CONTACTED", recoveredAt: new Date(), nextFollowUpAt: new Date(), lastContactedAt: new Date(), lossReason: null },
  });

  if (result.count) {
    await prisma.leadActivity.create({ data: { leadId: id, type: "LEAD_RECOVERED", content: "Lead reopened for a new follow-up" } });
  }
  revalidatePath(leadsPath);
}
