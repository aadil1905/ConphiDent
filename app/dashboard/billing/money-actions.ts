"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { rupees } from "@/lib/format";

const OFFLINE = "That didn't save — your connection dropped. Nothing was lost; try again.";

export type MoneyResult =
  | { ok: true; note: string; paymentId?: number }
  | { ok: false; message: string };

/**
 * A payment taken from the list row. Partial is fine — the point is that
 * nobody has to leave the page to take ₹500 off a bill.
 */
export async function takePaymentAction(
  invoiceId: number,
  amount: number,
  method: string,
): Promise<MoneyResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Put in an amount first." };
  }
  try {
    const user = await requirePermission("recordPayment");
    type Taken = { error: string } | { error?: undefined; paymentId: number; who: string };
    const result: Taken = await prisma.$transaction(
      async (tx): Promise<Taken> => {
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, clinicId: user.clinicId, voidedAt: null },
          select: {
            id: true,
            totalAmount: true,
            encounterId: true,
            patientId: true,
            patient: { select: { fullName: true } },
            payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
          },
        });
        if (!invoice) return { error: "That invoice is gone — refresh the list." };

        const paidSoFar = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const due = invoice.totalAmount - paidSoFar;
        if (amount > due) {
          return { error: `That is more than the ${rupees(due)} still owing.` };
        }

        const created = await tx.payment.create({
          data: {
            clinicId: user.clinicId,
            encounterId: invoice.encounterId,
            invoiceId,
            amount,
            method,
            paidAt: new Date(),
            recordedBy: user.fullName,
            recordedByUserId: user.id,
          },
          select: { id: true },
        });
        const receiptNumber = `${user.clinic.receiptPrefix || "RCT"}-${new Date().getFullYear()}-${String(created.id).padStart(6, "0")}`;
        await tx.payment.update({ where: { id: created.id }, data: { receiptNumber } });
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { status: paidSoFar + amount === invoice.totalAmount ? "Paid" : "Partially Paid" },
        });
        await tx.auditLog.create({
          data: {
            clinicId: user.clinicId,
            userId: user.id,
            patientId: invoice.patientId,
            actorRole: user.role,
            action: "PAYMENT_RECORDED",
            entityType: "PAYMENT",
            entityId: String(created.id),
            detail: `Receipt ${receiptNumber} recorded on invoice #${invoiceId}`,
            source: "BILLING",
          },
        });
        return {
          paymentId: created.id,
          who: invoice.patient.fullName.split(" ")[0] || invoice.patient.fullName,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.error !== undefined) return { ok: false, message: result.error };
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard");
    return {
      ok: true,
      paymentId: result.paymentId,
      // Nothing sends a receipt anywhere in this action — it only writes the
      // Payment row. "Receipt sent." told the receptionist to tell a patient
      // it was on its way, and it never arrived.
      note: `${rupees(amount)} taken by ${method} from ${result.who}.`,
    };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** The Undo behind the payment toast — a reversal, not a delete. */
export async function reversePaymentAction(paymentId: number): Promise<MoneyResult> {
  try {
    const user = await requirePermission("recordPayment");
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, clinicId: user.clinicId, reversedAt: null },
      select: { id: true, invoiceId: true, amount: true },
    });
    if (!payment) return { ok: false, message: "That payment was already put back." };

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REVERSED", reversedAt: new Date(), reversalReason: "Undone from the Money list" },
      });
      const invoice = await tx.invoice.findUnique({
        where: { id: payment.invoiceId },
        select: {
          totalAmount: true,
          payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
        },
      });
      if (!invoice) return;
      const paid = invoice.payments.reduce((sum, item) => sum + item.amount, 0);
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: paid === 0 ? "Unpaid" : paid >= invoice.totalAmount ? "Paid" : "Partially Paid" },
      });
    });

    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard");
    return { ok: true, note: "Payment put back — nothing was recorded." };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Genuinely irreversible, so this one gets a dialog that names the consequence. */
export async function voidInvoiceAction(invoiceId: number, reason: string): Promise<MoneyResult> {
  try {
    const user = await requirePermission("manageBilling");
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId: user.clinicId, voidedAt: null },
      select: { id: true, invoiceNumber: true, patientId: true },
    });
    if (!invoice) return { ok: false, message: "That invoice is already void." };

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { voidedAt: new Date(), voidReason: reason.slice(0, 300) || "Voided from the Money list", status: "Void" },
      });
      await tx.auditLog.create({
        data: {
          clinicId: user.clinicId,
          userId: user.id,
          patientId: invoice.patientId,
          actorRole: user.role,
          action: "INVOICE_VOIDED",
          entityType: "INVOICE",
          entityId: String(invoiceId),
          detail: `${invoice.invoiceNumber} voided`,
          source: "BILLING",
        },
      });
    });

    revalidatePath("/dashboard/billing");
    return { ok: true, note: `${invoice.invoiceNumber} is void. It no longer counts towards collections.` };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
