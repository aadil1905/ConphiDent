import "server-only";

import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { rupees } from "@/lib/format";

export type SearchKind =
  | "Patient"
  | "Visit"
  | "Enquiry"
  | "Invoice"
  | "Lab"
  | "Message"
  | "Plan"
  | "Prescription";

export type SearchHit = {
  kind: SearchKind;
  title: string;
  detail: string;
  href: string;
};

type Viewer = { clinicId: number; role: string };

const PER_KIND = 6;

/**
 * The one search the workspace uses. The command palette and the Find anything
 * page both read from here so a query never returns two different answers.
 */
export async function searchWorkspace(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [billingEnabled, clinicalEnabled, labEnabled] = await Promise.all([
    hasFeature(viewer.clinicId, "billing"),
    hasFeature(viewer.clinicId, "clinical"),
    hasFeature(viewer.clinicId, "laboratory"),
  ]);

  const allowed = {
    patients: can(viewer.role, "managePatients"),
    schedule: can(viewer.role, "manageSchedule"),
    billing: billingEnabled && can(viewer.role, "manageBilling"),
    clinical: clinicalEnabled && can(viewer.role, "viewClinical"),
    lab: labEnabled && can(viewer.role, "manageLaboratory"),
    whatsapp: can(viewer.role, "sendWhatsApp"),
  };

  const insensitive = { contains: q, mode: "insensitive" } as const;

  const [patients, appointments, leads, invoices, labCases, conversations, plans, prescriptions] =
    await Promise.all([
      allowed.patients
        ? prisma.patient.findMany({
            where: {
              clinicId: viewer.clinicId,
              archivedAt: null,
              OR: [{ fullName: insensitive }, { phone: { contains: q } }],
            },
            select: { id: true, fullName: true, phone: true },
            take: PER_KIND,
          })
        : [],
      allowed.schedule
        ? prisma.appointment.findMany({
            where: {
              clinicId: viewer.clinicId,
              archivedAt: null,
              OR: [{ patientName: insensitive }, { phone: { contains: q } }, { treatment: insensitive }],
            },
            select: { id: true, patientName: true, treatment: true, appointmentDate: true, appointmentTime: true },
            orderBy: { appointmentDate: "desc" },
            take: PER_KIND,
          })
        : [],
      allowed.patients
        ? prisma.lead.findMany({
            where: { clinicId: viewer.clinicId, OR: [{ fullName: insensitive }, { phone: { contains: q } }] },
            select: { id: true, fullName: true, phone: true, stage: true },
            take: PER_KIND,
          })
        : [],
      allowed.billing
        ? prisma.invoice.findMany({
            where: {
              clinicId: viewer.clinicId,
              voidedAt: null,
              OR: [
                { invoiceNumber: insensitive },
                { patient: { OR: [{ fullName: insensitive }, { phone: { contains: q } }] } },
              ],
            },
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              patient: { select: { fullName: true } },
              payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
            },
            take: PER_KIND,
          })
        : [],
      allowed.lab
        ? prisma.labCase.findMany({
            where: {
              clinicId: viewer.clinicId,
              cancelledAt: null,
              OR: [{ labName: insensitive }, { orderNumber: insensitive }, { patient: { fullName: insensitive } }],
            },
            select: { id: true, orderNumber: true, caseType: true, labName: true, patient: { select: { fullName: true } } },
            take: PER_KIND,
          })
        : [],
      allowed.whatsapp
        ? prisma.whatsAppConversation.findMany({
            where: {
              clinicId: viewer.clinicId,
              OR: [
                { phone: { contains: q } },
                { patient: { fullName: insensitive } },
                { lead: { fullName: insensitive } },
                { messages: { some: { content: insensitive } } },
              ],
            },
            select: {
              id: true,
              phone: true,
              patient: { select: { fullName: true } },
              lead: { select: { fullName: true } },
            },
            take: PER_KIND,
          })
        : [],
      allowed.clinical
        ? prisma.treatmentPlan.findMany({
            where: {
              clinicId: viewer.clinicId,
              cancelledAt: null,
              OR: [{ title: insensitive }, { notes: insensitive }, { patient: { fullName: insensitive } }],
            },
            select: { id: true, title: true, patientId: true, patient: { select: { fullName: true } } },
            take: PER_KIND,
          })
        : [],
      allowed.clinical
        ? prisma.prescription.findMany({
            where: {
              clinicId: viewer.clinicId,
              status: "ISSUED",
              cancelledAt: null,
              OR: [{ diagnosis: insensitive }, { medicines: insensitive }, { patient: { fullName: insensitive } }],
            },
            select: { id: true, diagnosis: true, medicines: true, patient: { select: { fullName: true } } },
            take: PER_KIND,
          })
        : [],
    ]);

  return [
    ...patients.map((item): SearchHit => ({
      kind: "Patient",
      title: item.fullName,
      detail: item.phone,
      href: `/dashboard/patients/${item.id}`,
    })),
    ...appointments.map((item): SearchHit => ({
      kind: "Visit",
      title: item.patientName,
      detail: `${item.treatment} · ${item.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${item.appointmentTime}`,
      href: `/dashboard/appointments/${item.id}`,
    })),
    ...invoices.map((item): SearchHit => {
      const paid = item.payments.reduce((sum, payment) => sum + payment.amount, 0);
      const due = item.totalAmount - paid;
      return {
        kind: "Invoice",
        title: `${item.invoiceNumber} · ${rupees(item.totalAmount)}`,
        detail: due > 0 ? `${item.patient.fullName} · ${rupees(due)} still due` : `${item.patient.fullName} · paid in full`,
        href: `/dashboard/billing/${item.id}`,
      };
    }),
    ...leads.map((item): SearchHit => ({
      kind: "Enquiry",
      title: item.fullName,
      detail: `${item.phone} · ${item.stage.toLowerCase().replace(/_/g, " ")}`,
      href: `/dashboard/leads?lead=${item.id}`,
    })),
    ...labCases.map((item): SearchHit => ({
      kind: "Lab",
      title: item.orderNumber || `Lab case ${item.id}`,
      detail: `${item.patient.fullName} · ${item.caseType} · ${item.labName}`,
      href: `/dashboard/laboratory/${item.id}`,
    })),
    ...conversations.map((item): SearchHit => ({
      kind: "Message",
      title: item.patient?.fullName || item.lead?.fullName || item.phone,
      detail: `WhatsApp · ${item.phone}`,
      href: `/dashboard/conversations?conversation=${item.id}`,
    })),
    ...plans.map((item): SearchHit => ({
      kind: "Plan",
      title: item.title,
      detail: item.patient.fullName,
      href: `/dashboard/patients/${item.patientId}#plans`,
    })),
    ...prescriptions.map((item): SearchHit => ({
      kind: "Prescription",
      title: item.patient.fullName,
      detail: item.diagnosis || item.medicines.slice(0, 70),
      href: `/dashboard/prescriptions/${item.id}/print`,
    })),
  ];
}
