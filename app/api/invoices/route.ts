import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";
import { findCompletedAppointment, localDate } from "@/lib/clinical-appointments";

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiPermission("manageBilling");
    if (!user) return response;
    const data = invoiceSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    const treatmentPlanId = typeof data.treatmentPlanId === "number" ? data.treatmentPlanId : null;
    if (treatmentPlanId) {
      const plan = await prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, patientId: patient.id } });
      if (!plan) return NextResponse.json({ error: "Treatment plan not found." }, { status: 404 });
    }
    const appointment = await findCompletedAppointment(user.clinicId, patient.id, data.issueDate);
    if (!appointment) {
      return NextResponse.json(
        { error: "Select one of this patient's completed appointment dates." },
        { status: 400 },
      );
    }

    const amountPaidToday = typeof data.amountPaidToday === "number" ? data.amountPaidToday : 0;
    if (amountPaidToday > data.totalAmount) return NextResponse.json({ error: "Today's payment cannot exceed the invoice total." }, { status: 400 });
    let invoice;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        invoice = await prisma.$transaction(async (tx) => {
          const invoiceNumber = data.invoiceNumber.trim();
          const created = await tx.invoice.create({ data: { invoiceNumber, patientId: patient.id, treatmentPlanId, issueDate: localDate(data.issueDate), dueDate: data.dueDate ? localDate(data.dueDate) : null, totalAmount: data.totalAmount, status: amountPaidToday === data.totalAmount ? "Paid" : amountPaidToday > 0 ? "Partially Paid" : "Unpaid", notes: data.notes || null } });
          await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "INVOICE_CREATED", entityType: "INVOICE", entityId: String(created.id), detail: `Created invoice ${invoiceNumber} for patient #${patient.id}` } });
          if (amountPaidToday > 0) {
            const payment = await tx.payment.create({ data: { invoiceId: created.id, amount: amountPaidToday, method: data.paymentMethod || "Cash", paidAt: new Date(), notes: data.paymentNotes || null, recordedBy: user.fullName } });
            await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "PAYMENT_RECORDED", entityType: "PAYMENT", entityId: String(payment.id), detail: `Recorded opening payment of ${amountPaidToday} on invoice ${invoiceNumber}` } });
          }
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    if (!invoice) throw new Error("Could not create invoice.");
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Please check the invoice details.", issues: error.flatten() }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "That invoice number already exists. Enter a different number." }, { status: 409 });
    return NextResponse.json({ error: "Could not create invoice." }, { status: 500 });
  }
}
