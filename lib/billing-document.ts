import "server-only";

export type BillingDocumentInput = {
  clinic: { name: string; brandName?: string | null; logoUrl?: string | null; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; registrationNumber?: string | null; invoiceFooter?: string | null; paymentDetails?: string | null };
  invoice: { invoiceNumber: string; issueDate: Date; dueDate?: Date | null; totalAmount: number; status: string; notes?: string | null; patient: { fullName: string; phone: string; email?: string | null }; payments: { amount: number; method: string; paidAt: Date }[] };
};

/** Single source of truth for invoice, receipt, estimate, and print/export renderers. */
export function buildInvoiceDocument(input: BillingDocumentInput) {
  const paidAmount = input.invoice.payments.reduce((total, payment) => total + payment.amount, 0);
  return {
    type: "INVOICE" as const,
    brandName: input.clinic.brandName || input.clinic.name,
    logoUrl: input.clinic.logoUrl || null,
    legalName: input.clinic.name,
    address: input.clinic.address || null,
    phone: input.clinic.phone || null,
    email: input.clinic.email || null,
    gstin: input.clinic.gstin || null,
    registrationNumber: input.clinic.registrationNumber || null,
    documentNumber: input.invoice.invoiceNumber,
    issuedAt: input.invoice.issueDate,
    dueAt: input.invoice.dueDate || null,
    patient: input.invoice.patient,
    totalAmount: input.invoice.totalAmount,
    paidAmount,
    outstandingAmount: Math.max(0, input.invoice.totalAmount - paidAmount),
    status: input.invoice.status,
    notes: input.invoice.notes || null,
    paymentDetails: input.clinic.paymentDetails || null,
    footer: input.clinic.invoiceFooter || "Powered by ConphiDent",
  };
}
