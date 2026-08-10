import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";

class InvoiceNotFoundError extends Error {}
class PaymentExceedsOutstandingError extends Error {}

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiPermission("manageBilling");
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
            where: { id: invoiceId, patient: { clinicId: user.clinicId } },
            include: { payments: { select: { amount: true } } },
          });
          if (!invoice) throw new InvoiceNotFoundError();

          const paidSoFar = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
          if (paidSoFar + data.amount > invoice.totalAmount) throw new PaymentExceedsOutstandingError();

          const created = await tx.payment.create({
            data: { invoiceId, amount: data.amount, method: data.method, paidAt: new Date(data.paidAt), notes: data.notes || null, recordedBy: user.fullName },
          });
          const status = paidSoFar + data.amount === invoice.totalAmount ? "Paid" : "Partially Paid";
          await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
          await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, action: "PAYMENT_RECORDED", entityType: "PAYMENT", entityId: String(created.id), detail: `Recorded payment of ${data.amount} on invoice #${invoiceId}` } });
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (error instanceof InvoiceNotFoundError || error instanceof PaymentExceedsOutstandingError) throw error;
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the payment details.", issues: error.flatten() }, { status: 400 });
    if (error instanceof InvoiceNotFoundError) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    if (error instanceof PaymentExceedsOutstandingError) return NextResponse.json({ error: "Payment exceeds the outstanding amount." }, { status: 400 });
    return NextResponse.json({ error: "Could not record payment." }, { status: 500 });
  }
}
