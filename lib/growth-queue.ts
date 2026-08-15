/**
 * One queue, two tables. An enquiry that nobody has rung back and a patient
 * whose crown is sitting at the lab are the same job to the person on the
 * desk, so Growth reads `Lead` and `FollowUpTask` into a single list ordered by
 * the promise that is oldest.
 *
 * Paging across two tables stays exact without loading everything: the first
 * `skip + take` of the merged list can only contain rows from the first
 * `skip + take` of each table, because both are sorted on the same key.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { humanLabel } from "@/lib/format";

export const QUEUE_FILTERS = [
  { value: "today", label: "Due today" },
  { value: "overdue", label: "Overdue" },
  { value: "enquiries", label: "New enquiries" },
  { value: "patients", label: "Patients" },
  { value: "mine", label: "Mine" },
  { value: "everyone", label: "Everyone" },
  // Without this, a written-off enquiry is invisible for ever and there is no
  // way back — the old Leads screen could always reopen one.
  { value: "lost", label: "Written off" },
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number]["value"];

export const DEFAULT_QUEUE_FILTER: QueueFilter = "today";

export function parseQueueFilter(value: string | undefined): QueueFilter {
  return QUEUE_FILTERS.some((filter) => filter.value === value)
    ? (value as QueueFilter)
    : DEFAULT_QUEUE_FILTER;
}

/**
 * A lead leaves the queue once it converts, is written off, or gets a visit in
 * the book — a booked patient's next move belongs to the Schedule, not here.
 */
const CLOSED_LEAD_STAGES = ["CONVERTED", "LOST", "BOOKED"];
/** A task stops being work once it is completed or cancelled. */
export const OPEN_TASK_STATUSES = ["PENDING", "QUEUED", "SENT", "FAILED"];

/**
 * Pressing Done asks how it ended, because this is the only place a loss
 * reason is ever recorded — "Why people did not come" is built from it.
 */
export const CLOSE_OUTCOMES = [
  { value: "booked", label: "They booked — take me to the booking", lossReason: null, recorded: "Booked a visit" },
  { value: "thinking", label: "They will think about it — remind me in a week", lossReason: null, recorded: "Thinking about it" },
  { value: "elsewhere", label: "Went somewhere else", lossReason: "Went elsewhere", recorded: "Went elsewhere" },
  { value: "expensive", label: "Too expensive for them", lossReason: "Too expensive", recorded: "Too expensive" },
  { value: "not-interested", label: "Wrong number or not interested", lossReason: "Not interested", recorded: "Not interested" },
] as const;

export function closeOutcome(value: string) {
  return CLOSE_OUTCOMES.find((outcome) => outcome.value === value) ?? null;
}

/** What an action overwrote, handed to the toast so Undo can put it back. */
export type QueueUndo = {
  key: string;
  name: string;
  /** Set when the outcome was "they booked" — where to send them next. */
  booking?: string | null;
  lead?: { stage: string; lossReason: string | null; nextFollowUpAt: string | null };
  task?: { status: string; outcome: string | null; scheduledFor: string; completedAt: string | null };
};

export type QueueItem = {
  /** "lead:12" / "task:34" — one id space for selection across both tables. */
  key: string;
  name: string;
  phone: string;
  /** Somebody we already treat, rather than somebody who has only enquired. */
  isPatient: boolean;
  patientId: number | null;
  /** Where they came from, or what put them in the queue. */
  origin: string;
  why: string;
  /** Null only for a lead nobody has promised to ring back. */
  due: Date | null;
  stage: string;
  owner: string | null;
  /** A written-off enquiry: the only thing to do with it is bring it back. */
  lost: boolean;
};

export type QueueCounts = Record<QueueFilter, number>;

function leadSearch(q: string): Prisma.LeadWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  return {
    OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: digits || q } },
      { serviceInterest: { contains: q, mode: "insensitive" } },
    ],
  };
}

function taskSearch(q: string): Prisma.FollowUpTaskWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  return {
    OR: [
      { patientName: { contains: q, mode: "insensitive" } },
      { phone: { contains: digits || q } },
      { message: { contains: q, mode: "insensitive" } },
    ],
  };
}

/** "NEW" reads as a database word; "Not called yet" reads as the truth. */
function leadStageLabel(stage: string) {
  if (stage === "NEW") return "Not called yet";
  if (stage === "CONTACTED") return "Spoken to once";
  if (stage === "BOOKED") return "Booked a visit";
  if (stage === "VISITED") return "Has been in";
  return humanLabel(stage);
}

function taskStatusLabel(status: string) {
  if (status === "PENDING") return "Not contacted";
  if (status === "QUEUED") return "Message on its way";
  if (status === "SENT") return "Message sent, waiting on them";
  if (status === "FAILED") return "The message did not go out";
  return humanLabel(status);
}

function lostLabel(reason: string | null) {
  return reason?.trim() ? `Written off — ${reason.trim().toLowerCase()}` : "Written off";
}

function leadWhy(notes: string | null, serviceInterest: string | null) {
  if (notes?.trim()) return notes.trim();
  if (serviceInterest?.trim()) return `Asked about ${serviceInterest.trim().toLowerCase()}.`;
  return "No note yet — ring and find out what they need.";
}

async function fetchLeadItems(where: Prisma.LeadWhereInput, take: number): Promise<QueueItem[]> {
  const leads = await prisma.lead.findMany({
    where,
    // A lead nobody has promised to ring back sits at the bottom, not the top.
    orderBy: { nextFollowUpAt: { sort: "asc", nulls: "last" } },
    take,
    select: {
      id: true,
      fullName: true,
      phone: true,
      source: true,
      serviceInterest: true,
      notes: true,
      stage: true,
      lossReason: true,
      nextFollowUpAt: true,
      patientId: true,
      owner: { select: { fullName: true } },
    },
  });

  return leads.map((lead) => ({
    key: `lead:${lead.id}`,
    name: lead.fullName,
    phone: lead.phone,
    isPatient: false,
    patientId: lead.patientId,
    origin: lead.source || "Not recorded",
    why: leadWhy(lead.notes, lead.serviceInterest),
    due: lead.nextFollowUpAt,
    stage: lead.stage === "LOST" ? lostLabel(lead.lossReason) : leadStageLabel(lead.stage),
    owner: lead.owner?.fullName ?? null,
    lost: lead.stage === "LOST",
  }));
}

async function fetchTaskItems(
  where: Prisma.FollowUpTaskWhereInput,
  take: number,
): Promise<QueueItem[]> {
  const tasks = await prisma.followUpTask.findMany({
    where,
    orderBy: { scheduledFor: "asc" },
    take,
    select: {
      id: true,
      patientName: true,
      phone: true,
      message: true,
      taskType: true,
      status: true,
      scheduledFor: true,
      patientId: true,
      assignedUser: { select: { fullName: true } },
    },
  });

  return tasks.map((task) => ({
    key: `task:${task.id}`,
    name: task.patientName,
    phone: task.phone,
    isPatient: Boolean(task.patientId),
    patientId: task.patientId,
    origin: humanLabel(task.taskType),
    why: task.message,
    due: task.scheduledFor,
    stage: taskStatusLabel(task.status),
    owner: task.assignedUser?.fullName ?? null,
    lost: false,
  }));
}

/** Where "Book them in" goes, from either side of the queue. */
export function bookingHref(patientId: number | null, name: string, phone: string | null) {
  const params = new URLSearchParams({ returnTo: "/dashboard/growth" });
  if (patientId) {
    params.set("patientId", String(patientId));
  } else {
    params.set("name", name);
    if (phone) params.set("phone", phone);
  }
  return `/dashboard/appointments/new?${params.toString()}`;
}

type QueueScope = {
  clinicId: number;
  userId: number;
  q: string;
  filter: QueueFilter;
  now: Date;
  page: number;
  size: number;
};

/**
 * The whole queue in one call: the page of rows, the honest total, and the
 * count behind every filter chip so nobody has to click one to find out it is
 * empty.
 */
export async function loadGrowthQueue({ clinicId, userId, q, filter, now, page, size }: QueueScope) {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const openLeads: Prisma.LeadWhereInput = {
    clinicId,
    stage: { notIn: CLOSED_LEAD_STAGES },
    ...leadSearch(q),
  };
  const openTasks: Prisma.FollowUpTaskWhereInput = {
    clinicId,
    status: { in: OPEN_TASK_STATUSES },
    ...taskSearch(q),
  };

  const [
    leadOpen,
    leadToday,
    leadOverdue,
    leadMine,
    taskOpen,
    taskAboutPatients,
    taskToday,
    taskOverdue,
    taskMine,
    leadLost,
  ] = await Promise.all([
    prisma.lead.count({ where: openLeads }),
    prisma.lead.count({ where: { ...openLeads, nextFollowUpAt: { lt: endOfToday } } }),
    prisma.lead.count({ where: { ...openLeads, nextFollowUpAt: { lt: now } } }),
    prisma.lead.count({ where: { ...openLeads, ownerId: userId } }),
    prisma.followUpTask.count({ where: openTasks }),
    prisma.followUpTask.count({ where: { ...openTasks, patientId: { not: null } } }),
    prisma.followUpTask.count({ where: { ...openTasks, scheduledFor: { lt: endOfToday } } }),
    prisma.followUpTask.count({ where: { ...openTasks, scheduledFor: { lt: now } } }),
    prisma.followUpTask.count({ where: { ...openTasks, assignedUserId: userId } }),
    prisma.lead.count({ where: { clinicId, stage: "LOST", ...leadSearch(q) } }),
  ]);

  const counts: QueueCounts = {
    today: leadToday + taskToday,
    overdue: leadOverdue + taskOverdue,
    // A follow-up with no patient behind it is still somebody who only enquired.
    enquiries: leadOpen + (taskOpen - taskAboutPatients),
    patients: taskAboutPatients,
    mine: leadMine + taskMine,
    everyone: leadOpen + taskOpen,
    lost: leadLost,
  };

  const leadWhere: Prisma.LeadWhereInput =
    filter === "lost"
      ? { clinicId, stage: "LOST", ...leadSearch(q) }
      : {
          ...openLeads,
          ...(filter === "today" ? { nextFollowUpAt: { lt: endOfToday } } : {}),
          ...(filter === "overdue" ? { nextFollowUpAt: { lt: now } } : {}),
          ...(filter === "mine" ? { ownerId: userId } : {}),
        };
  const taskWhere: Prisma.FollowUpTaskWhereInput = {
    ...openTasks,
    ...(filter === "today" ? { scheduledFor: { lt: endOfToday } } : {}),
    ...(filter === "overdue" ? { scheduledFor: { lt: now } } : {}),
    ...(filter === "enquiries" ? { patientId: null } : {}),
    ...(filter === "patients" ? { patientId: { not: null } } : {}),
    ...(filter === "mine" ? { assignedUserId: userId } : {}),
  };

  // The counts are already in hand, so a page number past the end can be
  // clamped before a single row is fetched.
  const total = counts[filter];
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const skip = (current - 1) * size;

  const window = skip + size;
  const [leadItems, taskItems] = await Promise.all([
    // "Patients" is the one filter no enquiry can satisfy, so skip the query.
    filter === "patients" ? Promise.resolve<QueueItem[]>([]) : fetchLeadItems(leadWhere, window),
    // Written-off enquiries are leads only — no follow-up task is ever lost.
    filter === "lost" ? Promise.resolve<QueueItem[]>([]) : fetchTaskItems(taskWhere, window),
  ]);

  const merged = [...leadItems, ...taskItems].sort((a, b) => {
    if (!a.due) return b.due ? 1 : a.key.localeCompare(b.key);
    if (!b.due) return -1;
    return a.due.getTime() - b.due.getTime() || a.key.localeCompare(b.key);
  });

  return { items: merged.slice(skip, skip + size), total, counts, page: current, pages };
}
