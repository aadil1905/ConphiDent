"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { OPEN_TASK_STATUSES, bookingHref, closeOutcome, type QueueUndo } from "@/lib/growth-queue";
import { sendFollowUpAction } from "@/app/dashboard/follow-ups/actions";

const GROWTH = "/dashboard/growth";

/** Every action here changes what the queue and the huddle brief show. */
function revalidateQueue() {
  revalidatePath(GROWTH);
  revalidatePath("/dashboard/huddle");
  revalidatePath("/dashboard");
}

/** "lead:12" is the only id the client ever holds. */
function parseKey(key: string) {
  const match = /^(lead|task):(\d+)$/.exec(key);
  if (!match) return null;
  const id = Number(match[2]);
  return Number.isSafeInteger(id) && id > 0 ? { source: match[1] as "lead" | "task", id } : null;
}

function parseKeys(keys: string[]) {
  return keys.slice(0, 100).map(parseKey).filter((entry) => entry !== null);
}

function atHour(now: Date, addDays: number, hour: number) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, hour, 0, 0, 0);
}

/**
 * Nothing in this queue is destructive, so nothing asks "are you sure" — every
 * action hands back what it overwrote and the toast offers Undo for 8 seconds.
 */
export async function snoozeQueueItemAction(key: string): Promise<QueueUndo | null> {
  const user = await requirePermission("managePatients");
  const target = parseKey(key);
  if (!target) return null;

  const now = new Date();
  const later = atHour(now, 1, 10);

  if (target.source === "lead") {
    const lead = await prisma.lead.findFirst({
      where: { id: target.id, clinicId: user.clinicId },
      select: { fullName: true, stage: true, lossReason: true, nextFollowUpAt: true },
    });
    if (!lead) return null;
    await prisma.lead.updateMany({
      where: { id: target.id, clinicId: user.clinicId },
      data: { nextFollowUpAt: later },
    });
    revalidateQueue();
    return {
      key,
      name: lead.fullName,
      lead: {
        stage: lead.stage,
        lossReason: lead.lossReason,
        nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
      },
    };
  }

  const task = await prisma.followUpTask.findFirst({
    where: { id: target.id, clinicId: user.clinicId },
    select: { patientName: true, status: true, outcome: true, scheduledFor: true, completedAt: true },
  });
  if (!task) return null;
  await prisma.followUpTask.updateMany({
    where: { id: target.id, clinicId: user.clinicId, status: { in: OPEN_TASK_STATUSES } },
    data: { status: "PENDING", scheduledFor: later, snoozedUntil: later },
  });
  revalidateQueue();
  return {
    key,
    name: task.patientName,
    task: {
      status: task.status,
      outcome: task.outcome,
      scheduledFor: task.scheduledFor.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
    },
  };
}

/**
 * The one place a loss reason is ever recorded, which is why "Done" asks how it
 * ended instead of just clearing the row.
 */
export async function closeQueueItemAction(key: string, outcomeValue: string): Promise<QueueUndo | null> {
  const user = await requirePermission("managePatients");
  const target = parseKey(key);
  const outcome = closeOutcome(outcomeValue);
  if (!target || !outcome) return null;

  const now = new Date();
  const inAWeek = atHour(now, 7, 10);

  if (target.source === "lead") {
    const lead = await prisma.lead.findFirst({
      where: { id: target.id, clinicId: user.clinicId },
      select: {
        fullName: true,
        phone: true,
        stage: true,
        lossReason: true,
        nextFollowUpAt: true,
        patientId: true,
      },
    });
    if (!lead) return null;

    // Somebody who has booked is a patient of the clinic, so this is where the
    // enquiry becomes a real patient record and the two are tied together. The
    // stage stops at BOOKED — they have not been treated yet, and the funnel on
    // this very page would be lying if it said otherwise.
    if (outcome.value === "booked") {
      const patientId = await linkLeadToPatient(user.clinicId, target.id);
      revalidateQueue();
      return {
        key,
        name: lead.fullName,
        booking: bookingHref(patientId, lead.fullName, lead.phone),
        lead: {
          stage: lead.stage,
          lossReason: lead.lossReason,
          nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
        },
      };
    }

    const data =
      outcome.value === "thinking"
          ? { stage: "CONTACTED", lossReason: null, nextFollowUpAt: inAWeek, lastContactedAt: now }
          : { stage: "LOST", lossReason: outcome.lossReason, nextFollowUpAt: null, lastContactedAt: now };

    const result = await prisma.lead.updateMany({
      where: { id: target.id, clinicId: user.clinicId },
      data,
    });
    if (result.count) {
      await prisma.leadActivity.create({
        data: { leadId: target.id, type: "STAGE_CHANGED", content: `Closed from the queue: ${outcome.label}` },
      });
    }
    revalidateQueue();
    return {
      key,
      name: lead.fullName,
      lead: {
        stage: lead.stage,
        lossReason: lead.lossReason,
        nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
      },
    };
  }

  const task = await prisma.followUpTask.findFirst({
    where: { id: target.id, clinicId: user.clinicId },
    select: {
      patientName: true,
      phone: true,
      status: true,
      outcome: true,
      scheduledFor: true,
      completedAt: true,
      patientId: true,
    },
  });
  if (!task) return null;

  await prisma.followUpTask.updateMany({
    where: { id: target.id, clinicId: user.clinicId, status: { in: OPEN_TASK_STATUSES } },
    data:
      outcome.value === "thinking"
        ? { status: "PENDING", scheduledFor: inAWeek, snoozedUntil: inAWeek }
        : { status: "COMPLETED", outcome: outcome.recorded, completedAt: now },
  });
  revalidateQueue();
  return {
    key,
    name: task.patientName,
    booking: outcome.value === "booked" ? bookingHref(task.patientId, task.patientName, task.phone) : null,
    task: {
      status: task.status,
      outcome: task.outcome,
      scheduledFor: task.scheduledFor.toISOString(),
      completedAt: task.completedAt?.toISOString() ?? null,
    },
  };
}

/** Puts back the stage, dates and reason the last action overwrote, nothing else. */
export async function undoQueueItemAction(undo: QueueUndo) {
  const user = await requirePermission("managePatients");
  const target = parseKey(undo.key);
  if (!target) return;

  if (target.source === "lead" && undo.lead) {
    const stages = ["NEW", "CONTACTED", "BOOKED", "VISITED", "CONVERTED", "LOST"];
    if (!stages.includes(undo.lead.stage)) return;
    await prisma.lead.updateMany({
      where: { id: target.id, clinicId: user.clinicId },
      data: {
        stage: undo.lead.stage,
        lossReason: undo.lead.lossReason?.slice(0, 120) ?? null,
        nextFollowUpAt: readDate(undo.lead.nextFollowUpAt),
      },
    });
  }

  if (target.source === "task" && undo.task) {
    const statuses = [...OPEN_TASK_STATUSES, "COMPLETED", "CANCELLED"];
    const scheduledFor = readDate(undo.task.scheduledFor);
    if (!statuses.includes(undo.task.status) || !scheduledFor) return;
    await prisma.followUpTask.updateMany({
      where: { id: target.id, clinicId: user.clinicId },
      data: {
        status: undo.task.status,
        outcome: undo.task.outcome?.slice(0, 80) ?? null,
        scheduledFor,
        completedAt: readDate(undo.task.completedAt),
        snoozedUntil: null,
      },
    });
  }

  revalidateQueue();
}

/**
 * An enquiry becomes a patient. Reuses whoever is already on the list with that
 * number rather than creating a second file for the same person, and ties the
 * enquiry, the patient and any WhatsApp thread together.
 */
async function linkLeadToPatient(clinicId: number, leadId: number) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, clinicId },
      select: { id: true, fullName: true, phone: true, email: true, patientId: true },
    });
    if (!lead) return null;

    const existing = lead.patientId
      ? await tx.patient.findFirst({ where: { id: lead.patientId, clinicId }, select: { id: true } })
      : await tx.patient.findUnique({
          where: { clinicId_phone: { clinicId, phone: lead.phone } },
          select: { id: true },
        });
    const patient =
      existing ??
      (await tx.patient.create({
        data: { clinicId, fullName: lead.fullName, phone: lead.phone, email: lead.email },
        select: { id: true },
      }));

    await tx.lead.update({
      where: { id: lead.id },
      data: { patientId: patient.id, stage: "BOOKED", nextFollowUpAt: null, lastContactedAt: new Date() },
    });
    await tx.whatsAppConversation.updateMany({
      where: { clinicId, phone: lead.phone },
      data: { patientId: patient.id, leadId: lead.id },
    });
    await tx.leadActivity.create({
      data: { leadId: lead.id, type: "LEAD_CONVERTED", content: `Booked in as patient #${patient.id}` },
    });
    return patient.id;
  });
}

/** Brings a written-off enquiry back into the queue with a callback for today. */
export async function reopenQueueItemAction(key: string): Promise<QueueUndo | null> {
  const user = await requirePermission("managePatients");
  const target = parseKey(key);
  if (!target || target.source !== "lead") return null;

  const lead = await prisma.lead.findFirst({
    where: { id: target.id, clinicId: user.clinicId, stage: "LOST" },
    select: { fullName: true, stage: true, lossReason: true, nextFollowUpAt: true },
  });
  if (!lead) return null;

  const result = await prisma.lead.updateMany({
    where: { id: target.id, clinicId: user.clinicId, stage: "LOST" },
    data: {
      stage: "CONTACTED",
      lossReason: null,
      recoveredAt: new Date(),
      nextFollowUpAt: new Date(),
      lastContactedAt: new Date(),
    },
  });
  if (result.count) {
    await prisma.leadActivity.create({
      data: { leadId: target.id, type: "LEAD_RECOVERED", content: "Reopened from the queue" },
    });
  }

  revalidateQueue();
  return {
    key,
    name: lead.fullName,
    lead: {
      stage: lead.stage,
      lossReason: lead.lossReason,
      nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    },
  };
}

function readDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Hands a batch of the queue to one person, so nobody rings the same patient twice. */
export async function assignQueueItemsAction(keys: string[], assigneeId: number) {
  const user = await requirePermission("managePatients");
  const targets = parseKeys(keys);
  if (!targets.length) return { assigned: 0, name: "" };

  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, clinicId: user.clinicId, active: true },
    select: { id: true, fullName: true },
  });
  if (!assignee) return { assigned: 0, name: "" };

  const leadIds = targets.filter((t) => t.source === "lead").map((t) => t.id);
  const taskIds = targets.filter((t) => t.source === "task").map((t) => t.id);

  const [leads, tasks] = await Promise.all([
    leadIds.length
      ? prisma.lead.updateMany({
          where: { id: { in: leadIds }, clinicId: user.clinicId },
          data: { ownerId: assignee.id },
        })
      : { count: 0 },
    taskIds.length
      ? prisma.followUpTask.updateMany({
          where: { id: { in: taskIds }, clinicId: user.clinicId, status: { in: OPEN_TASK_STATUSES } },
          data: { assignedUserId: assignee.id },
        })
      : { count: 0 },
  ]);

  revalidateQueue();
  return { assigned: leads.count + tasks.count, name: assignee.fullName };
}

/**
 * Bulk WhatsApp still goes through the single-send path one at a time, so the
 * consent record, template choice and audit entry are identical to sending by
 * hand. Anyone without a patient record behind them is skipped, not forced.
 */
export async function messageQueueItemsAction(keys: string[]) {
  const user = await requirePermission("sendWhatsApp");
  const taskIds = parseKeys(keys)
    .filter((target) => target.source === "task")
    .map((target) => target.id)
    .slice(0, 50);

  const sendable = taskIds.length
    ? await prisma.followUpTask.findMany({
        where: {
          id: { in: taskIds },
          clinicId: user.clinicId,
          status: "PENDING",
          patientId: { not: null },
        },
        select: { id: true },
      })
    : [];

  for (const task of sendable) {
    const form = new FormData();
    form.set("id", String(task.id));
    form.set("consentConfirmed", "1");
    await sendFollowUpAction(form);
  }

  const after = sendable.length
    ? await prisma.followUpTask.findMany({
        where: { id: { in: sendable.map((task) => task.id) }, clinicId: user.clinicId },
        select: { status: true },
      })
    : [];

  const sent = after.filter((task) => task.status === "SENT" || task.status === "QUEUED").length;
  revalidateQueue();
  return { sent, failed: after.length - sent, skipped: keys.length - sendable.length };
}

/** The "someone just called" card. Three fields, and a callback set for the morning. */
export async function logEnquiryAction(formData: FormData) {
  const user = await requirePermission("managePatients");
  const fullName = String(formData.get("fullName") || "").trim().slice(0, 120);
  const phone = String(formData.get("phone") || "").replace(/\D/g, "");
  const serviceInterest = String(formData.get("serviceInterest") || "").trim().slice(0, 80) || null;
  const bookNow = String(formData.get("intent") || "") === "book";

  if (fullName.length < 2 || phone.length < 10) {
    redirect(`${GROWTH}?log=1&invalid=1`);
  }

  const lead = await prisma.lead.upsert({
    where: { clinicId_phone: { clinicId: user.clinicId, phone } },
    create: {
      clinicId: user.clinicId,
      ownerId: user.id,
      fullName,
      phone,
      source: "Phone enquiry",
      serviceInterest,
      nextFollowUpAt: atHour(new Date(), 1, 10),
      activities: { create: { type: "LEAD_CREATED", content: "Logged from the queue" } },
    },
    update: { fullName, serviceInterest },
    select: { id: true, patientId: true },
  });

  revalidateQueue();
  redirect(bookNow ? bookingHref(lead.patientId, fullName, phone) : `${GROWTH}?logged=1`);
}
