import { prisma } from "@/lib/prisma";

type FollowUpCandidate = {
  clinicId: number;
  leadId?: number;
  patientId?: number;
  sourceType?: string;
  sourceId?: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  patientName: string;
  phone: string;
  taskType: "LEAD_NURTURE" | "MISSED_APPOINTMENT" | "CANCELLATION_RECOVERY" | "RECALL_FOLLOW_UP" | "TREATMENT_FOLLOW_UP" | "PAYMENT_FOLLOW_UP" | "LABORATORY_FOLLOW_UP";
  message: string;
  metadata?: string;
};

async function addTaskIfNeeded(candidate: FollowUpCandidate) {
  if (!candidate.patientName.trim() || !candidate.phone.trim()) return false;
  const existing = await prisma.followUpTask.findFirst({
    where: {
      clinicId: candidate.clinicId,
      leadId: candidate.leadId,
      phone: candidate.phone,
      taskType: candidate.taskType,
      status: { in: ["PENDING", "SENT"] },
      ...(candidate.sourceType && candidate.sourceId ? { sourceType: candidate.sourceType, sourceId: candidate.sourceId } : {}),
    },
  });
  if (existing) return false;
  await prisma.followUpTask.create({ data: candidate });
  return true;
}

export async function generateFollowUpTasks(clinicId: number) {
  const now = new Date();
  const staleThreshold = new Date(now);
  staleThreshold.setDate(staleThreshold.getDate() - 2);
  const inactiveThreshold = new Date(now);
  inactiveThreshold.setDate(inactiveThreshold.getDate() - 180);
  const treatmentFollowUpThreshold = new Date(now);
  treatmentFollowUpThreshold.setDate(treatmentFollowUpThreshold.getDate() - 3);

  const [leads, patients, recoveryAppointments, proposedPlans, overdueInvoices, delayedLabCases] = await Promise.all([
    prisma.lead.findMany({
      where: { clinicId, stage: { in: ["NEW", "CONTACTED"] }, updatedAt: { lte: staleThreshold } },
      take: 100,
    }),
    prisma.patient.findMany({
      where: { clinicId },
      include: { appointments: { where: { archivedAt: null, status: "Completed" }, orderBy: { appointmentDate: "desc" }, take: 1 } },
      take: 300,
    }),
    prisma.appointment.findMany({
      where: { clinicId, archivedAt: null, status: { in: ["No-show", "Cancelled"] }, appointmentDate: { lt: now } },
      take: 100,
    }),
    prisma.treatmentPlan.findMany({
      where: {
        status: "Proposed",
        updatedAt: { lte: treatmentFollowUpThreshold },
        patient: { clinicId },
      },
      include: { patient: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { updatedAt: "asc" },
      take: 100,
    }),
    prisma.invoice.findMany({
      where: { dueDate: { lt: now }, status: { notIn: ["PAID", "CANCELLED"] }, patient: { clinicId } },
      include: { patient: { select: { id: true, fullName: true, phone: true } }, payments: { select: { amount: true } } },
      orderBy: { dueDate: "asc" },
      take: 100,
    }),
    prisma.labCase.findMany({
      where: { clinicId, dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED", "DELIVERED"] } },
      include: { patient: { select: { id: true, fullName: true, phone: true } } },
      orderBy: { dueDate: "asc" },
      take: 100,
    }),
  ]);

  let created = 0;
  for (const lead of leads) {
    const didCreate = await addTaskIfNeeded({
      clinicId,
      leadId: lead.id,
      patientName: lead.fullName,
      phone: lead.phone,
      taskType: "LEAD_NURTURE",
      message: `Hello ${lead.fullName}, this is a friendly follow-up from our clinic. Would you like help booking your appointment?`,
    });
    if (didCreate) created += 1;
  }

  for (const appointment of recoveryAppointments) {
    const isCancellation = appointment.status === "Cancelled";
    const didCreate = await addTaskIfNeeded({
      clinicId,
      patientName: appointment.patientName,
      phone: appointment.phone,
      taskType: isCancellation ? "CANCELLATION_RECOVERY" : "MISSED_APPOINTMENT",
      patientId: appointment.patientId ?? undefined,
      sourceType: "APPOINTMENT",
      sourceId: String(appointment.id),
      priority: isCancellation ? "HIGH" : "URGENT",
      message: isCancellation
        ? `Hello ${appointment.patientName}, we noticed your appointment was cancelled. Would you like us to help you choose another convenient time?`
        : `Hello ${appointment.patientName}, we missed you at your scheduled appointment. Would you like us to help you choose a new time?`,
      metadata: JSON.stringify({ appointmentId: appointment.id, recoveryReason: appointment.status }),
    });
    if (didCreate) created += 1;
  }

  for (const patient of patients) {
    const lastAppointment = patient.appointments[0];
    if (!lastAppointment || lastAppointment.appointmentDate > inactiveThreshold) continue;
    const didCreate = await addTaskIfNeeded({
      clinicId,
      patientName: patient.fullName,
      phone: patient.phone,
      taskType: "RECALL_FOLLOW_UP",
      patientId: patient.id,
      sourceType: "PATIENT_RECALL",
      sourceId: String(patient.id),
      message: `Hello ${patient.fullName}, it has been some time since your last visit. Would you like to schedule your next dental check-up?`,
      metadata: JSON.stringify({ lastCompletedAppointmentAt: lastAppointment.appointmentDate.toISOString() }),
    });
    if (didCreate) created += 1;
  }

  for (const plan of proposedPlans) {
    const didCreate = await addTaskIfNeeded({
      clinicId,
      patientName: plan.patient.fullName,
      phone: plan.patient.phone,
      taskType: "TREATMENT_FOLLOW_UP",
      patientId: plan.patient.id,
      sourceType: "TREATMENT_PLAN",
      sourceId: String(plan.id),
      priority: "HIGH",
      message: `Hello ${plan.patient.fullName}, we are following up on your proposed ${plan.title} treatment plan. Please let us know if you would like to discuss it or choose a suitable next appointment.`,
      metadata: JSON.stringify({ treatmentPlanId: plan.id, treatmentPlanTitle: plan.title }),
    });
    if (didCreate) created += 1;
  }

  for (const invoice of overdueInvoices) {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const balance = invoice.totalAmount - paid;
    if (balance <= 0) continue;
    const didCreate = await addTaskIfNeeded({
      clinicId,
      patientId: invoice.patient.id,
      sourceType: "INVOICE",
      sourceId: String(invoice.id),
      priority: "HIGH",
      patientName: invoice.patient.fullName,
      phone: invoice.patient.phone,
      taskType: "PAYMENT_FOLLOW_UP",
      message: `Hello ${invoice.patient.fullName}, a balance of ₹${balance.toLocaleString("en-IN")} remains on invoice ${invoice.invoiceNumber}. Please let us know if you need a payment link or would like to discuss it.`,
      metadata: JSON.stringify({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, outstandingBalance: balance }),
    });
    if (didCreate) created += 1;
  }

  for (const labCase of delayedLabCases) {
    const didCreate = await addTaskIfNeeded({
      clinicId,
      patientId: labCase.patient.id,
      sourceType: "LAB_CASE",
      sourceId: String(labCase.id),
      priority: "URGENT",
      patientName: labCase.patient.fullName,
      phone: labCase.patient.phone,
      taskType: "LABORATORY_FOLLOW_UP",
      message: `Laboratory case ${labCase.orderNumber || `LAB-${labCase.id}`} for ${labCase.patient.fullName} is overdue. Confirm the laboratory status and arrange the next patient action.`,
      metadata: JSON.stringify({ labCaseId: labCase.id, labName: labCase.labName, dueDate: labCase.dueDate?.toISOString() }),
    });
    if (didCreate) created += 1;
  }

  return created;
}
