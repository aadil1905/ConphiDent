import Image from "next/image";
import type { ReactNode } from "react";
import type { BillingDocument } from "@/lib/billing-document";
import { formatPatientAgeSnapshot } from "@/lib/prescription-core";

export type ClinicDocumentBrand = {
  name: string;
  brandName?: string | null;
  logoUrl?: string | null;
  accentColor?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  registrationNumber?: string | null;
};

export type PrescriptionDocumentData = {
  id: number;
  version: number;
  prescribedOn: Date;
  issuedAt?: Date | null;
  diagnosis?: string | null;
  instructions?: string | null;
  medicines: string;
  allergySnapshot?: string | null;
  patientAgeSnapshot?: string | null;
  patientSexSnapshot?: string | null;
  providerNameSnapshot?: string | null;
  providerQualificationSnapshot?: string | null;
  providerRegistrationSnapshot?: string | null;
  issuePlace?: string | null;
  signatureStatement?: string | null;
  signedAt?: Date | null;
  patient: { fullName: string; phone: string; email?: string | null };
  medicationItems: Array<{
    id: number;
    genericName: string;
    brandName?: string | null;
    formulation?: string | null;
    strength: string;
    dosageForm: string;
    dose: string;
    doseUnit: string;
    route: string;
    frequency: string;
    timing?: string | null;
    mealRelation?: string | null;
    startDate?: Date | null;
    duration: string;
    endDate?: Date | null;
    quantity?: string | null;
    asNeeded: boolean;
    maxDose?: string | null;
    indication?: string | null;
    instructions?: string | null;
    substitutionAllowed: boolean;
  }>;
};

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const B6_PRINT_CSS = `
  @page {
    size: 125mm 176mm;
    margin: 8mm;
    @bottom-right {
      color: #334155;
      content: "Page " counter(page) " of " counter(pages);
      font-family: Arial, sans-serif;
      font-size: 6.5px;
      font-weight: 700;
    }
  }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .b6-document-viewport { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .b6-document-sheet {
      display: block !important;
      box-shadow: none !important;
      border: 0 !important;
      border-radius: 0 !important;
      overflow: visible !important;
      width: auto !important;
      max-width: none !important;
      min-height: 160mm !important;
      padding: 0 !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .b6-page-table { height: auto !important; }
    .b6-page-table thead { display: table-header-group; }
    .b6-page-table tfoot { display: table-footer-group; }
    .b6-page-fill { display: none !important; }
    .b6-break-avoid { break-inside: avoid-page; page-break-inside: avoid; }
  }
  @media screen {
    .b6-page-table { height: 160mm; }
    .b6-page-table > tbody > tr:not(.b6-page-fill) { height: 0; }
    .b6-page-fill { height: 100%; }
  }
  .b6-document-sheet { orphans: 3; widows: 3; }
  .b6-page-table { border-collapse: collapse; width: 100%; }
  .b6-page-table > tbody > tr > td { vertical-align: top; }
`;

function safeAccent(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#176b87";
}

function DocumentFrame({ accentColor, children }: { accentColor?: string | null; children: ReactNode }) {
  return (
    <div className="b6-document-viewport">
      <style>{B6_PRINT_CSS}</style>
      <article
        data-document-format="B6-125x176mm"
        className="b6-document-sheet mx-auto flex min-h-[176mm] w-full max-w-[125mm] flex-col overflow-hidden rounded-[5mm] border border-border bg-white p-[8mm] text-[10px] leading-[1.42] text-heading shadow-2xl shadow-[var(--shadow-overlay)]"
        style={{ borderTopColor: safeAccent(accentColor), borderTopWidth: "2.5mm" }}
      >
        {children}
      </article>
    </div>
  );
}

function DocumentHeader({ clinic, title, number }: { clinic: ClinicDocumentBrand; title: string; number: string }) {
  const brand = clinic.brandName?.trim() || clinic.name;
  const contact = [clinic.address, [clinic.phone, clinic.email].filter(Boolean).join(" · ")].filter(Boolean);
  return (
    <header className="b6-break-avoid grid grid-cols-[1fr_auto] gap-[5mm] border-b-2 border-heading pb-[4mm]">
      <div className="flex min-w-0 items-start gap-[3mm]">
        {clinic.logoUrl ? (
          <div className="flex size-[15mm] shrink-0 items-center justify-center overflow-hidden rounded-[2mm] border border-border bg-white p-[1mm]">
            <Image src={clinic.logoUrl} alt={`${brand} logo`} width={96} height={96} unoptimized className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="grid size-[13mm] shrink-0 place-items-center rounded-[2mm] bg-heading text-[18px] font-black text-white">{brand.slice(0, 1).toUpperCase()}</div>
        )}
        <div className="min-w-0">
          <h1 className="break-words font-serif text-[17px] font-black leading-tight text-heading">{brand}</h1>
          {brand !== clinic.name ? <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-text-muted">{clinic.name}</p> : null}
          <div className="mt-1 max-w-[62mm] whitespace-pre-line text-[8px] leading-[1.35] text-text-muted">{contact.join("\n")}</div>
          {clinic.registrationNumber ? <p className="mt-1 text-[8px] text-text-muted">Clinic registration: {clinic.registrationNumber}</p> : null}
        </div>
      </div>
      <div className="text-right">
        <p className="text-[8px] font-black uppercase tracking-[.18em] text-primary">{title}</p>
        <p className="mt-1 text-[13px] font-black text-heading">{number}</p>
      </div>
    </header>
  );
}

function Field({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
  return <div className={className}><p className="text-[7px] font-black uppercase tracking-[.12em] text-text-muted">{label}</p><div className="mt-0.5 min-w-0 font-semibold text-heading">{value}</div></div>;
}

function DocumentFooter({ left, right }: { left: string; right: string }) {
  return <footer className="b6-break-avoid flex items-end justify-between gap-4 border-t border-border-strong pt-[2mm] text-[7px] leading-snug text-text-muted"><span>{left}</span><span className="shrink-0 text-right font-bold text-text-muted">{right}</span></footer>;
}

function DocumentPageTable({
  clinic,
  title,
  number,
  footerLeft,
  footerRight,
  columns = 1,
  repeatingHeader,
  children,
}: {
  clinic: ClinicDocumentBrand;
  title: string;
  number: string;
  footerLeft: string;
  footerRight?: string;
  columns?: number;
  repeatingHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <table className="b6-page-table table-fixed">
      <thead>
        <tr><td colSpan={columns} className="pb-[3mm]"><DocumentHeader clinic={clinic} title={title} number={number} /></td></tr>
        {repeatingHeader}
      </thead>
      <tbody>
        {children}
        <tr aria-hidden="true" className="b6-page-fill"><td colSpan={columns} /></tr>
      </tbody>
      <tfoot><tr><td colSpan={columns} className="pt-[3mm]"><DocumentFooter left={footerLeft} right={footerRight ?? (clinic.brandName?.trim() || clinic.name)} /></td></tr></tfoot>
    </table>
  );
}

export function PrescriptionDocument({ clinic, prescription }: { clinic: ClinicDocumentBrand; prescription: PrescriptionDocumentData }) {
  const issuedAt = prescription.issuedAt || prescription.prescribedOn;
  const prescriber = [prescription.providerNameSnapshot, prescription.providerQualificationSnapshot].filter(Boolean).join(", ") || "Clinic dentist";
  const patientDetails = [formatPatientAgeSnapshot(prescription.patientAgeSnapshot), prescription.patientSexSnapshot].filter(Boolean).join(" · ") || "Not recorded";
  const legacyMedicationText = prescription.medicationItems.length === 0 ? prescription.medicines.trim() : "";
  const number = `RX-${prescription.id}-V${prescription.version}`;

  return (
    <DocumentFrame accentColor={clinic.accentColor}>
      <DocumentPageTable
        clinic={clinic}
        title="Prescription"
        number={number}
        footerLeft={`${number} · Issued clinical record for ${prescription.patient.fullName}`}
      >
        <tr className="b6-break-avoid"><td>
          <section className="grid grid-cols-2 gap-x-[5mm] gap-y-[2.5mm] border-b border-border-strong pb-[3.5mm]">
            <Field label="Patient" value={prescription.patient.fullName} />
            <Field label="Age / sex" value={patientDetails} />
            <Field label="Issued" value={date(issuedAt)} />
            <Field label="Patient contact" value={prescription.patient.phone || "Not recorded"} />
            <Field label="Prescriber" value={prescriber} />
            <Field label="Prescriber registration" value={prescription.providerRegistrationSnapshot || "Not recorded"} />
            {prescription.issuePlace ? <Field label="Issued at" value={prescription.issuePlace} /> : null}
            <Field label="Diagnosis / indication" value={prescription.diagnosis || "Not specified"} className={prescription.issuePlace ? "" : "col-span-2"} />
          </section>
        </td></tr>

        {prescription.allergySnapshot ? <tr className="b6-break-avoid"><td className="pt-[3mm]"><section className="rounded-[2mm] border border-amber-300 bg-amber-50 px-[3mm] py-[2mm] text-[8px] text-amber-950"><strong>Allergies / clinical alerts:</strong> {prescription.allergySnapshot}</section></td></tr> : null}

        <tr className="b6-break-avoid"><td className="pt-[3mm]"><div className="flex items-end justify-between border-b border-heading pb-[1.5mm]"><p className="font-serif text-[19px] font-black italic text-primary">Rx</p><p className="text-[7px] font-bold uppercase tracking-wider text-text-muted">Medication directions</p></div></td></tr>

        {prescription.medicationItems.map((item, index) => {
          const directions = [`${item.dose} ${item.doseUnit}`, item.route, item.frequency, item.mealRelation, item.timing, item.duration, item.asNeeded ? `As needed${item.maxDose ? ` (max ${item.maxDose})` : ""}` : null].filter(Boolean).join(" · ");
          return (
            <tr key={item.id} className="b6-break-avoid"><td className="pt-[2mm]"><section className="grid grid-cols-[6mm_1fr] gap-[2mm] rounded-[2mm] border border-border p-[2.5mm]">
              <span className="grid size-[5mm] place-items-center rounded-full bg-primary text-[8px] font-black text-white">{index + 1}</span>
              <div className="min-w-0">
                <p className="font-black text-heading">{item.genericName} {item.strength} {item.dosageForm}{item.brandName ? ` (${item.brandName})` : ""}</p>
                {item.formulation || item.indication ? <p className="mt-0.5 text-[8px] text-text-muted">{[item.formulation, item.indication && `For ${item.indication}`].filter(Boolean).join(" · ")}</p> : null}
                <p className="mt-1 font-semibold">{directions}</p>
                {item.instructions ? <p className="mt-0.5 text-[8px] text-text-muted">{item.instructions}</p> : null}
                <p className="mt-1 text-[7px] text-text-muted">{item.quantity ? `Quantity: ${item.quantity} · ` : ""}{item.substitutionAllowed ? "Substitution permitted" : "Do not substitute"}</p>
              </div>
            </section></td></tr>
          );
        })}

        {legacyMedicationText ? <tr className="b6-break-avoid"><td className="pt-[2mm]"><section className="rounded-[2mm] border border-amber-300 bg-amber-50 p-[3mm]"><p className="text-[7px] font-black uppercase tracking-wide text-amber-800">Legacy directions</p><p className="mt-1 whitespace-pre-wrap text-[9px]">{legacyMedicationText}</p></section></td></tr> : null}
        {prescription.instructions ? <tr className="b6-break-avoid"><td className="pt-[3mm]"><section className="rounded-[2mm] bg-muted p-[3mm]"><p className="text-[7px] font-black uppercase tracking-wide text-text-muted">Patient instructions</p><p className="mt-1 whitespace-pre-wrap text-[8px]">{prescription.instructions}</p></section></td></tr> : null}

        <tr className="b6-break-avoid"><td className="pt-[4mm]"><section className="ml-auto w-[55mm] border-t border-border-strong pt-[2mm] text-right">
          <p className="font-black">{prescription.signatureStatement || `Digitally issued by ${prescriber}`}</p>
          <p className="mt-0.5 text-[7px] text-text-muted">Signed {date(prescription.signedAt || issuedAt)} · Version {prescription.version}</p>
        </section></td></tr>
      </DocumentPageTable>
    </DocumentFrame>
  );
}

export function InvoiceDocument({ document }: { document: BillingDocument }) {
  const lines = document.lineItems.length ? document.lineItems : [{ id: 0, description: "Dental treatment and clinical services", quantity: 1, unitPrice: document.totalAmount, discount: 0, taxPercent: 0, lineTotal: document.totalAmount }];
  const clinic: ClinicDocumentBrand = { name: document.legalName, brandName: document.brandName, logoUrl: document.logoUrl, accentColor: document.accentColor, address: document.address, phone: document.phone, email: document.email, gstin: document.gstin, registrationNumber: document.registrationNumber };
  const title = document.type.replaceAll("_", " ");
  const footerLeft = `${document.documentNumber} · ${document.frozen ? "Immutable issue snapshot" : "Clinic billing record"} · INR`;

  return (
    <DocumentFrame accentColor={document.accentColor}>
      <DocumentPageTable
        clinic={clinic}
        title={title}
        number={document.documentNumber}
        footerLeft={footerLeft}
        footerRight={document.footer}
        columns={5}
        repeatingHeader={<>
          <tr className="b6-break-avoid"><td colSpan={5}>
            <section className="grid grid-cols-2 gap-x-[5mm] gap-y-[2.5mm] border-b border-border-strong pb-[3.5mm]">
              <Field label="Bill to" value={document.patient.fullName} />
              <Field label="Status" value={document.status} />
              <Field label="Patient contact" value={[document.patient.phone, document.patient.email].filter(Boolean).join(" · ") || "Not recorded"} />
              <Field label="Issue / due date" value={`${date(document.issuedAt)}${document.dueAt ? ` / ${date(document.dueAt)}` : ""}`} />
              {document.gstin ? <Field label="GSTIN" value={document.gstin} /> : null}
              {document.registrationNumber ? <Field label="Clinic registration" value={document.registrationNumber} /> : null}
            </section>
          </td></tr>
          <tr className="border-y border-heading bg-muted text-left text-[7px] font-black uppercase tracking-wide">
            <th className="w-[7mm] px-[1.5mm] py-[2mm]">#</th>
            <th className="px-[1.5mm] py-[2mm]">Description</th>
            <th className="w-[11mm] px-[1.5mm] py-[2mm] text-right">Qty</th>
            <th className="w-[20mm] px-[1.5mm] py-[2mm] text-right">Rate</th>
            <th className="w-[21mm] px-[1.5mm] py-[2mm] text-right">Amount</th>
          </tr>
        </>}
      >
        {lines.map((line, index) => <tr key={line.id} className="b6-break-avoid border-b border-border align-top text-[8px]"><td className="px-[1.5mm] py-[2mm] text-text-muted">{index + 1}</td><td className="break-words px-[1.5mm] py-[2mm] font-semibold">{line.description}</td><td className="px-[1.5mm] py-[2mm] text-right">{line.quantity}</td><td className="px-[1.5mm] py-[2mm] text-right">{money(line.unitPrice)}</td><td className="px-[1.5mm] py-[2mm] text-right font-bold">{money(line.lineTotal)}</td></tr>)}

        <tr className="b6-break-avoid"><td colSpan={5} className="pt-[3mm]"><section className="ml-auto w-[65mm] space-y-1 text-[8px]">
          <InvoiceTotal label="Subtotal" value={document.subtotalAmount} />
          {document.discountAmount ? <InvoiceTotal label="Discount" value={-document.discountAmount} /> : null}
          {document.taxAmount ? <InvoiceTotal label="Tax" value={document.taxAmount} /> : null}
          <InvoiceTotal label="Total" value={document.totalAmount} strong />
          <InvoiceTotal label="Paid" value={document.paidAmount} />
          <InvoiceTotal label="Outstanding" value={document.outstandingAmount} strong />
        </section></td></tr>

        {document.payments.length ? <tr className="b6-break-avoid"><td colSpan={5} className="pt-[3mm]"><section className="rounded-[2mm] border border-emerald-200 bg-emerald-50 p-[2.5mm]"><p className="text-[7px] font-black uppercase tracking-wide text-emerald-800">Payments received</p><div className="mt-1 space-y-0.5">{document.payments.map((payment, index) => <p key={`${payment.paidAt.toISOString()}-${index}`} className="flex justify-between gap-3"><span>{date(payment.paidAt)} · {payment.method}{payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}</span><strong>{money(payment.amount)}</strong></p>)}</div></section></td></tr> : null}
        {document.notes ? <tr className="b6-break-avoid"><td colSpan={5} className="pt-[2mm]"><DocumentSection title="Notes" text={document.notes} /></td></tr> : null}
        {document.terms ? <tr className="b6-break-avoid"><td colSpan={5} className="pt-[2mm]"><DocumentSection title="Terms" text={document.terms} /></td></tr> : null}
        {document.paymentDetails ? <tr className="b6-break-avoid"><td colSpan={5} className="pt-[2mm]"><DocumentSection title="Payment details" text={document.paymentDetails} /></td></tr> : null}
      </DocumentPageTable>
    </DocumentFrame>
  );
}

function InvoiceTotal({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex justify-between gap-5 ${strong ? "border-t border-heading pt-1 text-[10px] font-black" : ""}`}><span>{label}</span><span>{money(value)}</span></div>;
}

function DocumentSection({ title, text }: { title: string; text: string }) {
  return <section className="b6-break-avoid rounded-[2mm] bg-muted p-[2.5mm]"><p className="text-[7px] font-black uppercase tracking-wide text-text-muted">{title}</p><p className="mt-1 whitespace-pre-wrap text-[8px]">{text}</p></section>;
}
