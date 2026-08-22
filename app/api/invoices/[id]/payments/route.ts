import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiFeature } from "@/lib/tenant";

class InvoiceNotFoundError extends Error {}
class PaymentExceedsOutstandingError extends Error {}
class NonPayableDocumentError extends Error {}

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiFeature("billing");
    if (!user) return response;
    const { id } = await context.params;
    const invoiceId = Number(id);
    if (!Number.isInteger(invoiceId)) return NextResponse.json({ error: "Invalid invoice." }, { status: 400 });
    const data = paymentSchema.parse(await request.json());
    let payment;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        payment = await prisma.$transaction(async (tx) => {
          const invoice = await tx.invoice.findFirst({
            where: { id: invoiceId, clinicId: user.clinicId, voidedAt: null },
            include: { payments: { where: { status: "POSTED" }, select: { amount: true } } },
          });
          if (!invoice) throw new InvoiceNotFoundError();
          if (!["TAX_INVOICE", "NON_TAX_INVOICE"].includes(invoice.documentType)) throw new NonPayableDocumentError();

          const paidSoFar = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
          if (paidSoFar + data.amount > invoice.totalAmount) throw new PaymentExceedsOutstandingError();

          const created = await tx.payment.create({
            data: { clinicId: user.clinicId, encounterId: invoice.encounterId, invoiceId, amount: data.amount, method: data.method, paidAt: new Date(data.paidAt), notes: data.notes || null, referenceNumber: data.referenceNumber || null, recordedBy: user.fullName, recordedByUserId: user.id },
          });
          const receiptNumber = `${user.clinic.receiptPrefix || "RCT"}-${new Date(data.paidAt).getFullYear()}-${String(created.id).padStart(6, "0")}`;
          const receipted = await tx.payment.update({ where: { id: created.id }, data: { receiptNumber } });
          const status = paidSoFar + data.amount === invoice.totalAmount ? "Paid" : "Partially Paid";
          await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
          await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: invoice.patientId, actorRole: user.role, action: "PAYMENT_RECORDED", entityType: "PAYMENT", entityId: String(created.id), detail: `Receipt ${receiptNumber} recorded on invoice #${invoiceId}`, source: "BILLING" } });
          return receipted;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (error instanceof InvoiceNotFoundError || error instanceof PaymentExceedsOutstandingError || error instanceof NonPayableDocumentError) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the payment details.", issues: error.flatten() }, { status: 400 });
    if (error instanceof InvoiceNotFoundError) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (error instanceof PaymentExceedsOutstandingError) return NextResponse.json({ error: "Payment exceeds the outstanding amount." }, { status: 400 });
    if (error instanceof NonPayableDocumentError) return NextResponse.json({ error: "Payments can only be recorded against an issued invoice." }, { status: 409 });
    return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
  }
}
