import { Prisma } from "@prisma/client";
import { LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { InvoiceDocument, PrescriptionDocument, type ClinicDocumentBrand } from "@/components/documents/B6ClinicalDocuments";
import { PrintActions } from "@/components/documents/PrintActions";
import { buildInvoiceDocument } from "@/lib/billing-document";
import { prisma } from "@/lib/prisma";
import { secureDocumentTokenHash } from "@/lib/secure-documents";

export const dynamic = "force-dynamic";

export default async function SharedClinicalDocumentPage({ params }: { params: Promise<{ token: string }> }) {
 const token = (await params).token;
 if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) notFound();

 const tokenHash = secureDocumentTokenHash(token);
 const now = new Date();
 const access = await prisma.$transaction(async (tx) => {
 const candidate = await tx.secureDocumentAccess.findUnique({ where: { tokenHash } });
 if (!candidate || candidate.revokedAt || candidate.expiresAt <= now) return null;
 const claimed = await tx.secureDocumentAccess.updateMany({
 where: { id: candidate.id, revokedAt: null, expiresAt: { gt: now } },
 data: { firstViewedAt: candidate.firstViewedAt || now, lastViewedAt: now, viewCount: { increment: 1 } },
 });
 return claimed.count === 1 ? tx.secureDocumentAccess.findUnique({ where: { id: candidate.id } }) : null;
 }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(() => null);
 if (!access) notFound();

 const clinic = await prisma.clinic.findUnique({
 where: { id: access.clinicId },
 select: { name: true, brandName: true, logoUrl: true, accentColor: true, address: true, phone: true, email: true, gstin: true, registrationNumber: true, invoiceFooter: true, paymentDetails: true },
 });
 if (!clinic) notFound();

 if (access.documentType === "PRESCRIPTION") {
 const prescription = await prisma.prescription.findFirst({
 where: { id: access.documentId, clinicId: access.clinicId, patientId: access.patientId, status: "ISSUED", cancelledAt: null },
 include: { patient: true, medicationItems: { orderBy: { sortOrder: "asc" } } },
 });
 if (!prescription || (!prescription.medicationItems.length && !prescription.medicines.trim())) notFound();
 return <PatientDocumentPortal clinic={clinic} expiresAt={access.expiresAt} label="Prescription"><PrescriptionDocument clinic={clinic} prescription={prescription} /></PatientDocumentPortal>;
 }

 if (access.documentType === "INVOICE") {
 const invoice = await prisma.invoice.findFirst({
 where: { id: access.documentId, clinicId: access.clinicId, patientId: access.patientId, voidedAt: null },
 include: { patient: true, lineItems: { orderBy: { sortOrder: "asc" } }, payments: { where: { status: "POSTED" }, orderBy: { paidAt: "asc" } } },
 });
 if (!invoice) notFound();
 const document = buildInvoiceDocument({ clinic, invoice });
 return <PatientDocumentPortal clinic={clinic} expiresAt={access.expiresAt} label={document.type.replaceAll("_", " ")}><InvoiceDocument document={document} /></PatientDocumentPortal>;
 }

 notFound();
}

function PatientDocumentPortal({ clinic, expiresAt, label, children }: { clinic: ClinicDocumentBrand; expiresAt: Date; label: string; children: ReactNode }) {
 const brand = clinic.brandName?.trim() || clinic.name;
 return (
 <main className="min-h-screen bg-[radial-gradient(circle_at_top,#cffafe_0,#f1f5f9_34rem)] px-3 py-5 text-heading print:bg-white print:p-0">
 <header className="mx-auto mb-4 w-full max-w-[125mm] rounded-card border border-border bg-white/95 p-4 shadow-[var(--shadow)] print:hidden">
 <p className="text-[11px] font-bold uppercase tracking-[.18em] text-primary">Patient Document Portal</p>
 <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2"><h1 className="text-xl font-bold">{brand}</h1><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-heading">{label}</span></div>
 <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-text-muted"><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" />Private patient document. This link expires {expiresAt.toLocaleString("en-IN")}. Do not forward it.</p>
 </header>
 <PrintActions printLabel="Print / Save a copy" />
 {children}
 </main>
 );
}
