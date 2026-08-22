import "server-only";

export type BillingDocumentInput = {
  clinic: { name: string; brandName?: string | null; logoUrl?: string | null; accentColor?: string | null; letterheadPrefix?: string | null; letterheadName?: string | null; tagline?: string | null; principalName?: string | null; principalCredentials?: string | null; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null; registrationNumber?: string | null; invoiceFooter?: string | null; paymentDetails?: string | null; hoursLine?: string | null };
  invoice: { invoiceNumber: string; documentType: string; issueDate: Date; dueDate?: Date | null; subtotalAmount?: number | null; discountAmount: number; taxAmount: number; totalAmount: number; status: string; notes?: string | null; terms?: string | null; diagnosis?: string | null; immutableSnapshot?: unknown; patient: { fullName: string; phone: string; email?: string | null }; payments: { amount: number; method: string; paidAt: Date; status?: string; receiptNumber?: string | null; referenceNumber?: string | null }[]; lineItems: { id: number; description: string; quantity: number; unitPrice: number; discount: number; taxPercent: number; lineTotal: number }[] };
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown, fallback: string | null = null) {
  return typeof value === "string" ? value : fallback;
}

function amount(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function date(value: unknown, fallback: Date | null) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

/** Single source of truth for invoice, receipt, estimate, and print/export renderers. */
export function buildInvoiceDocument(input: BillingDocumentInput) {
  const payments = input.invoice.payments.filter((payment) => !payment.status || payment.status === "POSTED");
  const paidAmount = payments.reduce((total, payment) => total + payment.amount, 0);
  const snapshot = record(input.invoice.immutableSnapshot);
  const snapshotClinic = snapshot ? record(snapshot.clinic) : null;
  const snapshotPatient = snapshot ? record(snapshot.patient) : null;
  const snapshotLines = snapshot && Array.isArray(snapshot.lines)
    ? snapshot.lines.flatMap((value, index) => {
        const line = record(value);
        if (!line || typeof line.description !== "string") return [];
        return [{
          id: index + 1,
          description: line.description,
          quantity: amount(line.quantity, 1),
          unitPrice: amount(line.unitPrice, 0),
          discount: amount(line.discount, 0),
          taxPercent: amount(line.taxPercent, 0),
          lineTotal: amount(line.lineTotal, 0),
        }];
      })
    : null;
  const frozen = Boolean(snapshot && snapshotClinic && snapshotPatient);
  const totalAmount = frozen ? amount(snapshot?.totalAmount, input.invoice.totalAmount) : input.invoice.totalAmount;
  return {
    frozen,
    type: frozen ? text(snapshot?.documentType, input.invoice.documentType)! : input.invoice.documentType,
    brandName: frozen ? text(snapshotClinic?.brandName, text(snapshotClinic?.legalName, "Clinic"))! : input.clinic.brandName || input.clinic.name,
    logoUrl: frozen ? text(snapshotClinic?.logoUrl) : input.clinic.logoUrl || null,
    accentColor: frozen ? text(snapshotClinic?.accentColor, "#b68235")! : input.clinic.accentColor || "#b68235",
    legalName: frozen ? text(snapshotClinic?.legalName, "Clinic")! : input.clinic.name,
    // The letterhead is part of the frozen record. A clinic that re-brands must
    // not retroactively re-head bills it has already issued — an invoice reads
    // as the clinic it was issued by, on the day it was issued. Snapshots taken
    // before these columns existed fall through to the live values, which is
    // the only truth available for them.
    letterheadPrefix: frozen ? text(snapshotClinic?.letterheadPrefix, input.clinic.letterheadPrefix || null) : input.clinic.letterheadPrefix || null,
    letterheadName: frozen ? text(snapshotClinic?.letterheadName, input.clinic.letterheadName || null) : input.clinic.letterheadName || null,
    tagline: frozen ? text(snapshotClinic?.tagline, input.clinic.tagline || null) : input.clinic.tagline || null,
    principalName: frozen ? text(snapshotClinic?.principalName, input.clinic.principalName || null) : input.clinic.principalName || null,
    principalCredentials: frozen ? text(snapshotClinic?.principalCredentials, input.clinic.principalCredentials || null) : input.clinic.principalCredentials || null,
    hoursLine: frozen ? text(snapshotClinic?.hoursLine, input.clinic.hoursLine || null) : input.clinic.hoursLine || null,
    address: frozen ? text(snapshotClinic?.address) : input.clinic.address || null,
    phone: frozen ? text(snapshotClinic?.phone) : input.clinic.phone || null,
    email: frozen ? text(snapshotClinic?.email) : input.clinic.email || null,
    gstin: frozen ? text(snapshotClinic?.gstin) : input.clinic.gstin || null,
    registrationNumber: frozen ? text(snapshotClinic?.registrationNumber) : input.clinic.registrationNumber || null,
    documentNumber: frozen ? text(snapshot?.invoiceNumber, input.invoice.invoiceNumber)! : input.invoice.invoiceNumber,
    issuedAt: frozen ? date(snapshot?.issueDate, input.invoice.issueDate)! : input.invoice.issueDate,
    dueAt: frozen ? date(snapshot?.dueDate, null) : input.invoice.dueDate || null,
    patient: frozen ? {
      fullName: text(snapshotPatient?.fullName, "Patient")!,
      phone: text(snapshotPatient?.phone, "")!,
      email: text(snapshotPatient?.email),
    } : input.invoice.patient,
    totalAmount,
    subtotalAmount: frozen ? amount(snapshot?.subtotalAmount, totalAmount) : input.invoice.subtotalAmount ?? input.invoice.totalAmount,
    discountAmount: frozen ? amount(snapshot?.discountAmount, 0) : input.invoice.discountAmount,
    taxAmount: frozen ? amount(snapshot?.taxAmount, 0) : input.invoice.taxAmount,
    lineItems: frozen && snapshotLines?.length ? snapshotLines : input.invoice.lineItems,
    paidAmount,
    payments,
    outstandingAmount: Math.max(0, totalAmount - paidAmount),
    status: input.invoice.status,
    notes: frozen ? text(snapshot?.notes) : input.invoice.notes || null,
    terms: frozen ? text(snapshot?.terms) : input.invoice.terms || null,
    diagnosis: frozen ? text(snapshot?.diagnosis, input.invoice.diagnosis || null) : input.invoice.diagnosis || null,
    paymentDetails: frozen ? text(snapshotClinic?.paymentDetails, input.clinic.paymentDetails || null) : input.clinic.paymentDetails || null,
    footer: frozen ? text(snapshotClinic?.invoiceFooter, input.clinic.invoiceFooter || "Powered by ConphiDent")! : input.clinic.invoiceFooter || "Powered by ConphiDent",
  };
}

export type BillingDocument = ReturnType<typeof buildInvoiceDocument>;
