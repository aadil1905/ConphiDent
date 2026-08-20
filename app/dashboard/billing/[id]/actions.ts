"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export async function reversePaymentAction(formData: FormData) {
  const user = await requireFeature("billing");
  const paymentId = Number(formData.get("paymentId"));
  const invoiceId = Number(formData.get("invoiceId"));
  // The receptionist types why the money is going back, and that is what the
  // audit record must carry. This used to read a field the app's own CSS hid,
  // then discard it for a canned string — so the trail never said anything.
  const typed = String(formData.get("reversalReason") ?? "").trim();
  const reason = typed.length >= 8 ? typed : "";
  if (!Number.isInteger(paymentId) || !Number.isInteger(invoiceId) || formData.get("confirmed") !== "1") return;
  // The one refusal a person can actually act on: they typed something, it was
  // too short to be a reason. Everything else here is a tampered form.
  if (!reason) redirect(`/dashboard/billing/${invoiceId}?error=reason`);

  // Assigned inside the transaction callback, so it has to hang off an object —
  // control-flow analysis does not follow a plain `let` into a closure.
  const outcome: { refusal: string | null } = { refusal: null };

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, invoiceId, clinicId: user.clinicId, status: "POSTED" },
      include: { invoice: { select: { id: true, patientId: true, totalAmount: true, voidedAt: true } } },
    });
    if (!payment || payment.invoice.voidedAt) { outcome.refusal = "gone"; return; }
    const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "POSTED" }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason } });
    if (!claimed.count) { outcome.refusal = "gone"; return; }
    const remaining = await tx.payment.aggregate({ where: { invoiceId, status: "POSTED" }, _sum: { amount: true } });
    const paid = remaining._sum.amount || 0;
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: paid === payment.invoice.totalAmount ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid" } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: payment.invoice.patientId, actorRole: user.role, action: "PAYMENT_REVERSED", entityType: "PAYMENT", entityId: String(payment.id), detail: `Reversed payment ${payment.amount} on invoice #${invoiceId}`, reason, beforeState: { status: "POSTED", amount: payment.amount }, afterState: { status: "REVERSED" } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath(`/dashboard/billing/${invoiceId}`);
  revalidatePath("/dashboard/billing");
  if (outcome.refusal) redirect(`/dashboard/billing/${invoiceId}?error=${outcome.refusal}`);
}
