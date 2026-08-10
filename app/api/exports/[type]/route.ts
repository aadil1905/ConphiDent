import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function download(csv: string, name: string) {
  return new NextResponse(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ type: string }> }) {
  await requireFeature("reports");
  const user = await requirePermission("exportData");
  const { type } = await context.params;
  const stamp = new Date().toISOString().slice(0, 10);
  if (type === "appointments") {
    const records = await prisma.appointment.findMany({ where: { clinicId: user.clinicId }, orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "asc" }] });
    await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "DATA_EXPORTED", entityType: "APPOINTMENT", detail: `Exported ${records.length} appointment records` });
    return download(toCsv(["ID", "Patient", "Phone", "Date", "Time", "Treatment", "Status", "Source", "Reminder sent", "Notes"], records.map((item) => [item.id, item.patientName, item.phone, item.appointmentDate.toLocaleDateString("en-IN"), item.appointmentTime, item.treatment, item.status, item.source, item.reminderSentAt?.toLocaleString("en-IN"), item.notes])), `dentalai-appointments-${stamp}.csv`);
  }
  if (type === "patients") {
    const records = await prisma.patient.findMany({ where: { clinicId: user.clinicId }, orderBy: { fullName: "asc" } });
    await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "DATA_EXPORTED", entityType: "PATIENT", detail: `Exported ${records.length} patient records` });
    return download(toCsv(["ID", "Name", "Phone", "Email", "Date of birth", "Gender", "Address", "Medical notes", "Created"], records.map((item) => [item.id, item.fullName, item.phone, item.email, item.dateOfBirth?.toLocaleDateString("en-IN"), item.gender, item.address, item.medicalNotes, item.createdAt.toLocaleDateString("en-IN")])), `dentalai-patients-${stamp}.csv`);
  }
  if (type === "billing") {
    const records = await prisma.invoice.findMany({ where: { patient: { clinicId: user.clinicId } }, include: { patient: true, payments: true }, orderBy: { issueDate: "desc" } });
    await recordAudit({ clinicId: user.clinicId, userId: user.id, action: "DATA_EXPORTED", entityType: "INVOICE", detail: `Exported ${records.length} billing records` });
    return download(toCsv(["Invoice", "Patient", "Phone", "Issued", "Due", "Total", "Paid", "Outstanding", "Status", "Notes"], records.map((item) => { const paid = item.payments.reduce((sum, payment) => sum + payment.amount, 0); return [item.invoiceNumber, item.patient.fullName, item.patient.phone, item.issueDate.toLocaleDateString("en-IN"), item.dueDate?.toLocaleDateString("en-IN"), item.totalAmount, paid, item.totalAmount - paid, item.status, item.notes]; })), `dentalai-billing-${stamp}.csv`);
  }
  return NextResponse.json({ error: "Unknown export type." }, { status: 404 });
}
