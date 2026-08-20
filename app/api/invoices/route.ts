import { reportError } from "@/lib/monitoring";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { Prisma, type Invoice } from "@prisma/client";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { invoiceSchema } from "@/lib/validations";
import { requireApiFeature } from "@/lib/tenant";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { ensureEncounter } from "@/lib/encounters";
import { nextInvoiceNumber, normalizeInvoicePrefix } from "@/lib/invoice-number";

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiFeature("billing");
    if (!user) return response;
    const data = invoiceSchema.parse(await request.json());
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true, fullName: true, phone: true, email: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    const treatmentPlanId = typeof data.treatmentPlanId === "number" ? data.treatmentPlanId : null;
    if (treatmentPlanId && !await prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, patientId: patient.id, cancelledAt: null }, select: { id: true } })) return NextResponse.json({ error: "Treatment plan not found." }, { status: 404 });
    // An invoice can be raised on any day the patient was booked, or none.
    const appointment = await findVisitForDate(user.clinicId, patient.id, data.issueDate);
    const lines = data.lineItems.map((line, sortOrder) => { const base = line.quantity * line.unitPrice; const discount = Math.min(base, line.discount); const taxable = base - discount; const taxPercent = data.documentType === "TAX_INVOICE" ? line.taxPercent : 0; const taxAmount = Math.round(taxable * taxPercent / 100); return { description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, discount, taxPercent, taxAmount, lineTotal: taxable + taxAmount, sortOrder }; });
    const subtotalAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const discountAmount = lines.reduce((sum, line) => sum + line.discount, 0);
    const taxAmount = lines.reduce((sum, line) => sum + line.taxAmount, 0);
    const totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    if (totalAmount <= 0 || totalAmount !== data.totalAmount || discountAmount !== data.discountAmount) return NextResponse.json({ error: "Billing totals changed. Review the line items and retry." }, { status: 400 });
    const isInvoice = data.documentType === "TAX_INVOICE" || data.documentType === "NON_TAX_INVOICE";
    const amountPaidToday = isInvoice && typeof data.amountPaidToday === "number" ? data.amountPaidToday : 0;
    if (amountPaidToday > totalAmount) return NextResponse.json({ error: "Today's payment cannot exceed the document total." }, { status: 400 });
    let invoice: Invoice | undefined;
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        invoice = await prisma.$transaction(async (tx) => {
          // Serialize document-number allocation per tenant. This keeps two
          // reception desks from issuing the same number concurrently.
          //
          // Two details are load-bearing. The casts: the two-argument advisory
          // lock only exists as (int4, int4) and the driver binds a JS number
          // as bigint, so without them Postgres finds no matching function.
          // And $executeRaw rather than $queryRaw: the lock function returns
          // void, which $queryRaw cannot deserialize as a result column.
          // Either mistake makes every billing document fail to create.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${user.clinicId}::int, 20260813::int)`;
          const clinic = await tx.clinic.findUnique({
            where: { id: user.clinicId },
            select: {
              name: true,
              brandName: true,
              logoUrl: true,
              accentColor: true,
              address: true,
              phone: true,
              email: true,
              gstin: true,
              registrationNumber: true,
              invoicePrefix: true,
              receiptPrefix: true,
              invoiceFooter: true,
              paymentDetails: true,
              timezone: true,
            },
          });
          if (!clinic) throw new Error("Clinic not found.");
          const invoicePrefix = normalizeInvoicePrefix(clinic.invoicePrefix);
          const issuedNumbers = await tx.invoice.findMany({
            where: {
              clinicId: user.clinicId,
              invoiceNumber: { startsWith: `${invoicePrefix}-` },
            },
            select: { invoiceNumber: true },
          });
          const invoiceNumber = nextInvoiceNumber(
            invoicePrefix,
            issuedNumbers.map((entry) => entry.invoiceNumber),
          );
          const encounter = await ensureEncounter(tx, { clinicId: user.clinicId, patientId: patient.id, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(data.issueDate), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" });
          const issuedAt = new Date();
          const immutableSnapshot = { version: 1, documentType: data.documentType, invoiceNumber, clinic: { legalName: clinic.name, brandName: clinic.brandName, logoUrl: clinic.logoUrl, accentColor: clinic.accentColor, address: clinic.address, phone: clinic.phone, email: clinic.email, gstin: clinic.gstin, registrationNumber: clinic.registrationNumber, invoicePrefix: clinic.invoicePrefix, receiptPrefix: clinic.receiptPrefix, invoiceFooter: clinic.invoiceFooter, paymentDetails: clinic.paymentDetails, timezone: clinic.timezone }, patient, issuedAt: issuedAt.toISOString(), issueDate: data.issueDate, dueDate: data.dueDate || null, currency: "INR", lines, subtotalAmount, discountAmount, taxAmount, totalAmount, notes: data.notes || null, terms: data.terms || null };
          const created = await tx.invoice.create({ data: { clinicId: user.clinicId, encounterId: encounter.id, invoiceNumber, documentType: data.documentType, patientId: patient.id, treatmentPlanId, issueDate: localDate(data.issueDate), dueDate: data.dueDate ? localDate(data.dueDate) : null, subtotalAmount, discountAmount, taxAmount, totalAmount, status: isInvoice ? amountPaidToday === totalAmount ? "Paid" : amountPaidToday > 0 ? "Partially Paid" : "Unpaid" : "Issued", notes: data.notes || null, terms: data.terms || null, finalizedAt: issuedAt, immutableSnapshot, lineItems: { create: lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, taxPercent: line.taxPercent, lineTotal: line.lineTotal, sortOrder: line.sortOrder })) } } });
          const correlationId = randomUUID();
          await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "BILLING_DOCUMENT_CREATED", entityType: "INVOICE", entityId: String(created.id), detail: `${data.documentType} ${invoiceNumber} finalized for encounter #${encounter.id}`, source: "BILLING", correlationId, afterState: { documentType: data.documentType, totalAmount, status: created.status } } });
          if (amountPaidToday > 0) {
            const payment = await tx.payment.create({ data: { clinicId: user.clinicId, encounterId: encounter.id, invoiceId: created.id, amount: amountPaidToday, method: data.paymentMethod || "Cash", paidAt: issuedAt, notes: data.paymentNotes || null, recordedBy: user.fullName, recordedByUserId: user.id } });
            const receiptNumber = `${clinic.receiptPrefix || "RCT"}-${issuedAt.getFullYear()}-${String(payment.id).padStart(6, "0")}`;
            await tx.payment.update({ where: { id: payment.id }, data: { receiptNumber } });
            await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "PAYMENT_RECORDED", entityType: "PAYMENT", entityId: String(payment.id), detail: `Receipt ${receiptNumber} posted`, source: "BILLING", correlationId } });
          }
          return created;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");
        if (!retryable || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error;
      }
    }
    if (!invoice) throw new Error("Could not create billing document.");
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Please check the billing document details.", issues: error.flatten() }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A unique document number could not be allocated. Retry once." }, { status: 409 });
    await reportError(error, { where: "api/invoices" });
    return NextResponse.json({ error: "Could not create billing document." }, { status: 500 });
  }
}
