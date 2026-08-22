import Image from "next/image";
import type { ReactNode } from "react";
import type { BillingDocument } from "@/lib/billing-document";
import { formatPatientAgeSnapshot } from "@/lib/prescription-core";
import { rupeesInWords } from "@/lib/format";
import { documentFontVariables } from "@/lib/document-fonts";
import { type ClinicDocumentBrand, clinicDocumentName, letterheadLines } from "@/lib/clinic-document";

export type { ClinicDocumentBrand };

export type PrescriptionDocumentData = {
  id: number;
  version: number;
  prescribedOn: Date;
  issuedAt?: Date | null;
  diagnosis?: string | null;
  instructions?: string | null;
  nextVisit?: string | null;
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

const money = (value: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/* A4, not B6 any more. The B6 sheet declared its own 125×176mm page, and a
   clinic printer loaded with A4 rendered it as a small block floating on the
   sheet. Class and file names keep the b6- prefix — they are historical, and
   renaming them across four routes buys nothing. */
const B6_PRINT_CSS = `
  @page {
    size: A4;
    margin: 12mm;
    @bottom-right {
      color: #605d5d;
      content: "Page " counter(page) " of " counter(pages);
      font-family: Georgia, serif;
      font-size: 8px;
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
      min-height: 265mm !important;
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
    .b6-page-table { height: 245mm; }
    .b6-page-table > tbody > tr:not(.b6-page-fill) { height: 0; }
    .b6-page-fill { height: 100%; }
  }
  /* Paper is paper. This artifact renders inside the clinic shell, which now
     follows the operating system into dark mode — a bill must not. The sheet
     carries its own palette so that what a patient is handed is the same
     document in either mode.

     Ink is near-black and the base weight is 700 by inheritance, not by a
     universal selector: a pad gets photocopied, faxed and read across a desk,
     and the design was approved at that weight. Hierarchy is carried by size,
     family and tracking instead. */
  .b6-document-viewport {
    color-scheme: light;
    --dw-ink: #000000;
    --dw-muted: #605d5d;
    --dw-rule: #bab6b6;
    --dw-rule-strong: #605d5d;
    --dw-dot: #9b9797;
  }
  .b6-document-sheet {
    orphans: 3;
    widows: 3;
    color: var(--dw-ink);
    font-weight: 700;
  }
  .b6-page-table { border-collapse: collapse; width: 100%; }
  .b6-page-table > tbody > tr > td { vertical-align: top; }
  /* A hand-fill line, not a border on a box: the pads are printed blank and
     written on, so the rule has to sit under empty space and keep its height. */
  .b6-fill-line { border-bottom: 2px dotted var(--dw-dot); }
`;

function safeAccent(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#b68235";
}

export function DocumentFrame({ clinic, children }: { clinic: ClinicDocumentBrand; children: ReactNode }) {
  return (
    <div className={`b6-document-viewport ${documentFontVariables}`} style={{ ["--dw-accent" as string]: safeAccent(clinic.accentColor) }}>
      <style>{B6_PRINT_CSS}</style>
      <article
        data-document-format="A4-210x297mm"
        /* A4 in full, not the printable area: the 12mm padding stands in for
           the @page margin, so the content box on screen is the same 186×273mm
           the printer will use. At the old 186mm total the preview was 24mm
           narrower than the sheet and the letterhead wrapped where paper would
           not. */
        className="b6-document-sheet mx-auto flex min-h-[297mm] w-full max-w-[210mm] flex-col overflow-hidden rounded-[5mm] border border-[var(--dw-rule)] bg-white p-[12mm] font-[family-name:var(--font-document-body)] text-[12.8px] leading-[1.5] shadow-2xl"
      >
        {children}
      </article>
    </div>
  );
}

/**
 * The masthead every sheet opens with: logo, the clinic's name set as a
 * masthead rather than a label, the principal dentist's block opposite, then
 * the gold rule and the contact strip beneath it.
 */
function DocumentHeader({ clinic }: { clinic: ClinicDocumentBrand }) {
  const { prefix, name, tagline } = letterheadLines(clinic);
  const credentials = clinic.principalCredentials?.split("\n").map((line) => line.trim()).filter(Boolean) ?? [];
  const contact = [clinic.phone, clinic.email].filter(Boolean).join(" · ");

  return (
    <header className="b6-break-avoid">
      <div className="flex items-start gap-[16px]">
        {clinic.logoUrl ? (
          <Image src={clinic.logoUrl} alt={`${name} logo`} width={116} height={116} unoptimized className="size-[58px] shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0 flex-1">
          {prefix ? <div className="font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.22em] text-[var(--dw-muted)]">{prefix}</div> : null}
          <div className="font-[family-name:var(--font-document-display)] text-[31px] uppercase leading-[1.05] tracking-[.03em]">{name}</div>
          {tagline ? <div className="mt-[3px] text-[10.2px] uppercase tracking-[.16em] text-[var(--dw-muted)]">{tagline}</div> : null}
        </div>
        {clinic.principalName ? (
          <div className="shrink-0 text-right leading-[1.5]">
            <div className="font-[family-name:var(--font-document-display)] text-[17px] uppercase tracking-[.04em]">{clinic.principalName}</div>
            {credentials.map((line) => <div key={line} className="text-[12.6px]">{line}</div>)}
            {clinic.registrationNumber ? <div className="text-[12.6px] tabular-nums">Reg. No. {clinic.registrationNumber}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-[10px] border-t-2 border-[var(--dw-accent)]" />
      <div className="flex justify-between gap-[20px] border-b-[1.5px] border-[var(--dw-rule)] py-[6px] text-[11.4px] text-[var(--dw-muted)]">
        <div className="max-w-[52%]">{clinic.address}</div>
        <div className="text-right tabular-nums">
          {clinic.hoursLine ? <div>{clinic.hoursLine}</div> : null}
          {contact ? <div>{contact}</div> : null}
          {clinic.gstin ? <div>GSTIN {clinic.gstin}</div> : null}
        </div>
      </div>
    </header>
  );
}

/** The centred document title, letterspaced the way a pad heads its page. */
export function DocumentTitle({ children }: { children: ReactNode }) {
  return (
    <div className="py-[6px] text-center">
      <span className="font-[family-name:var(--font-document-display)] text-[19px] uppercase tracking-[.28em]">{children}</span>
    </div>
  );
}

/**
 * A label and the line it is written on. `value` absent leaves the rule empty,
 * which is what a blank pad wants.
 */
export function Field({ label, value, labelWidth = "74px", className = "" }: { label: string; value?: ReactNode; labelWidth?: string; className?: string }) {
  return (
    <div className={`flex gap-[8px] ${className}`}>
      <span className="shrink-0 text-[var(--dw-muted)]" style={{ minWidth: labelWidth }}>{label}</span>
      <span className="b6-fill-line min-w-0 flex-1 tabular-nums">{value || " "}</span>
    </div>
  );
}

/** A section rule: the small letterspaced caps a pad uses to head a block. */
export function SectionRule({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex justify-between gap-[22px] border-b-2 border-[var(--dw-rule-strong)] pb-[3px] font-[family-name:var(--font-document-display)] text-[14px] uppercase tracking-[.18em]">
      <span>{children}</span>
      {right ? <span>{right}</span> : null}
    </div>
  );
}

/** Empty ruled lines for anything filled in by hand. */
export function WriteLines({ count, height = 26 }: { count: number; height?: number }) {
  return <>{Array.from({ length: count }, (_, index) => <div key={index} className="b6-fill-line" style={{ height: `${height}px` }} />)}</>;
}

function DocumentFooter({ left, right }: { left?: string; right?: ReactNode }) {
  return (
    <footer className="b6-break-avoid flex items-end justify-between gap-[30px] pt-[6px]">
      <div className="max-w-[56%] text-[11.4px] leading-[1.6] text-[var(--dw-muted)]">{left}</div>
      {right ? <div className="min-w-[210px] text-right">{right}</div> : null}
    </footer>
  );
}

/** The ruled signature block that closes a sheet. */
export function SignatureBlock({ name, detail }: { name: string; detail?: string | null }) {
  return (
    <>
      <div className="h-[34px]" />
      <div className="border-t-2 border-[var(--dw-rule-strong)] pt-[5px] font-[family-name:var(--font-document-display)] text-[15.6px]">{name}</div>
      {detail ? <div className="text-[11.4px] tabular-nums text-[var(--dw-muted)]">{detail}</div> : null}
    </>
  );
}

export function DocumentPageTable({
  clinic,
  footerLeft,
  footerRight,
  columns = 1,
  repeatingHeader,
  children,
}: {
  clinic: ClinicDocumentBrand;
  footerLeft?: string;
  footerRight?: ReactNode;
  columns?: number;
  repeatingHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <table className="b6-page-table table-fixed">
      <thead>
        <tr><td colSpan={columns}><DocumentHeader clinic={clinic} /></td></tr>
        {repeatingHeader}
      </thead>
      <tbody>
        {children}
        <tr aria-hidden="true" className="b6-page-fill"><td colSpan={columns} /></tr>
      </tbody>
      {/* A sheet with nothing to say at the foot gets no tfoot at all — an
          empty band still costs its padding, which is the difference between
          the consent form fitting one A4 page and running onto a second. Page
          numbering lives in @page, not here, so nothing is lost. */}
      {footerLeft || footerRight ? <tfoot><tr><td colSpan={columns}><DocumentFooter left={footerLeft} right={footerRight} /></td></tr></tfoot> : null}
    </table>
  );
}

export function PrescriptionDocument({ clinic, prescription }: { clinic: ClinicDocumentBrand; prescription: PrescriptionDocumentData }) {
  const issuedAt = prescription.issuedAt || prescription.prescribedOn;
  const prescriberName = prescription.providerNameSnapshot || clinic.principalName || "Clinic dentist";
  const prescriberDetail = [prescription.providerQualificationSnapshot, prescription.providerRegistrationSnapshot && `Reg. No. ${prescription.providerRegistrationSnapshot}`].filter(Boolean).join(" · ");
  const patientDetails = [prescription.patient.fullName, formatPatientAgeSnapshot(prescription.patientAgeSnapshot), prescription.patientSexSnapshot].filter(Boolean).join(" — ");
  const legacyMedicationText = prescription.medicationItems.length === 0 ? prescription.medicines.trim() : "";
  const number = `RX-${prescription.id}-V${prescription.version}`;

  return (
    <DocumentFrame clinic={clinic}>
      <DocumentPageTable
        clinic={clinic}
        footerLeft="Not valid for medico-legal purposes. Please bring this prescription and all previous records on every visit."
        footerRight={<SignatureBlock name={prescription.signatureStatement || prescriberName} detail={prescriberDetail || null} />}
      >
        <tr className="b6-break-avoid"><td>
          <section className="grid grid-cols-2 gap-x-[26px] gap-y-[7px] border-b-[1.5px] border-[var(--dw-rule)] py-[11px] text-[13.8px]">
            <Field label="Patient" labelWidth="64px" value={patientDetails} />
            <Field label="Date" labelWidth="64px" value={date(issuedAt)} />
            <Field label="OPD No." labelWidth="64px" value={number} />
            <Field label="Mobile" labelWidth="64px" value={prescription.patient.phone} />
          </section>
        </td></tr>

        {prescription.allergySnapshot ? <tr className="b6-break-avoid"><td>
          <section className="border-b-[1.5px] border-[var(--dw-rule)] py-[10px] text-[13.8px] leading-[1.7]">
            <span className="font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Allergies</span>
            <span className="ml-[12px]">{prescription.allergySnapshot}</span>
          </section>
        </td></tr> : null}

        <tr className="b6-break-avoid"><td>
          <section className="border-b-[1.5px] border-[var(--dw-rule)] py-[12px] text-[13.8px] leading-[1.7]">
            <span className="font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Diagnosis</span>
            <span className="ml-[12px]">{prescription.diagnosis || "Not specified"}</span>
          </section>
        </td></tr>

        <tr className="b6-break-avoid"><td className="pt-[14px]">
          <div className="grid grid-cols-[1fr_110px_210px] border-b-2 border-[var(--dw-dot)] font-[family-name:var(--font-document-display)] text-[13.2px] uppercase tracking-[.12em] text-[var(--dw-muted)]">
            <span className="px-[6px] py-[5px]">Medicine</span>
            <span className="px-[6px] py-[5px] text-center">Dosage</span>
            <span className="px-[6px] py-[5px]">Timing · Duration</span>
          </div>
        </td></tr>

        {prescription.medicationItems.map((item) => {
          const detail = [item.formulation, item.instructions, item.indication && `For ${item.indication}`, item.asNeeded ? `Only if needed${item.maxDose ? ` — no more than ${item.maxDose}` : ""}` : "", item.quantity && `Quantity ${item.quantity}`, item.substitutionAllowed ? "" : "Do not substitute"].filter(Boolean).join(" · ");
          return (
            <tr key={item.id} className="b6-break-avoid"><td>
              <div className="grid grid-cols-[1fr_110px_210px] border-b-[1.5px] border-[var(--dw-rule)] text-[13.8px]">
                <div className="px-[6px] py-[8px]">
                  {item.genericName} {item.strength} {item.dosageForm}{item.brandName ? ` (${item.brandName})` : ""}
                  {detail ? <div className="text-[12px] italic text-[var(--dw-muted)]">{detail}</div> : null}
                </div>
                <div className="px-[6px] py-[8px] text-center tabular-nums">{item.dose} {item.doseUnit}</div>
                <div className="px-[6px] py-[8px]">{[item.mealRelation, item.timing, item.frequency, item.duration].filter(Boolean).join(" · ")}</div>
              </div>
            </td></tr>
          );
        })}

        {legacyMedicationText ? <tr className="b6-break-avoid"><td>
          <div className="whitespace-pre-wrap border-b-[1.5px] border-[var(--dw-rule)] px-[6px] py-[8px] text-[13.8px]">{legacyMedicationText}</div>
        </td></tr> : null}

        {prescription.instructions ? <tr className="b6-break-avoid"><td className="pt-[16px]">
          <div className="mb-[4px] font-[family-name:var(--font-document-display)] text-[14.4px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Advice</div>
          <div className="whitespace-pre-wrap text-[13.8px] leading-[1.75]">{prescription.instructions}</div>
        </td></tr> : null}

        {prescription.nextVisit ? <tr className="b6-break-avoid"><td className="pt-[14px]">
          <div className="border-t-[1.5px] border-[var(--dw-rule)] pt-[9px] text-[13.8px]">
            <span className="font-[family-name:var(--font-document-display)] text-[14.4px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Next visit</span>
            <span className="ml-[12px]">{prescription.nextVisit}</span>
          </div>
        </td></tr> : null}

        <tr className="b6-break-avoid"><td className="pt-[14px]">
          <div className="border-t-[1.5px] border-[var(--dw-rule)] pt-[9px] text-[13.8px]">
            <span className="font-[family-name:var(--font-document-display)] text-[14.4px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Issued</span>
            <span className="ml-[12px] tabular-nums">{date(prescription.signedAt || issuedAt)} · Version {prescription.version}</span>
          </div>
        </td></tr>
      </DocumentPageTable>
    </DocumentFrame>
  );
}

export function InvoiceDocument({ document }: { document: BillingDocument }) {
  const lines = document.lineItems.length ? document.lineItems : [{ id: 0, description: "Dental treatment and clinical services", quantity: 1, unitPrice: document.totalAmount, discount: 0, taxPercent: 0, lineTotal: document.totalAmount }];
  const clinic: ClinicDocumentBrand = { name: document.legalName, brandName: document.brandName, logoUrl: document.logoUrl, accentColor: document.accentColor, letterheadPrefix: document.letterheadPrefix, letterheadName: document.letterheadName, tagline: document.tagline, principalName: document.principalName, principalCredentials: document.principalCredentials, address: document.address, phone: document.phone, email: document.email, gstin: document.gstin, registrationNumber: document.registrationNumber, hoursLine: document.hoursLine };
  // "Tax invoice" is a GST term of art. Without a GSTIN on the clinic this
  // sheet is a plain invoice, and saying otherwise is wrong on paper.
  const rawTitle = document.type.replaceAll("_", " ");
  const title = document.gstin ? rawTitle : rawTitle.replace(/^TAX\s+/i, "");
  const footerLeft = `${document.documentNumber} · ${document.frozen ? "Immutable issue snapshot" : "Clinic billing record"} · Kindly retain this receipt for your records.`;
  // A receipt acknowledges money that arrived. With nothing received this sheet
  // is a demand, not an acknowledgement, so it says who it is billed to instead
  // of thanking them for a sum nobody has paid.
  const received = document.paidAmount > 0;

  return (
    <DocumentFrame clinic={clinic}>
      <DocumentPageTable
        clinic={clinic}
        footerLeft={footerLeft}
        footerRight={<SignatureBlock name={`For ${clinicDocumentName(clinic)}`} detail={[clinic.principalName, clinic.registrationNumber && `Reg. No. ${clinic.registrationNumber}`].filter(Boolean).join(" · ") || null} />}
        columns={2}
        repeatingHeader={<>
          <tr><td colSpan={2}><DocumentTitle>{title}</DocumentTitle></td></tr>
          <tr><td colSpan={2}>
            <section className="grid grid-cols-2 gap-x-[26px] gap-y-[9px] border-b-[1.5px] border-[var(--dw-rule)] pb-[12px] text-[13.8px]">
              <Field label="No." value={document.documentNumber} />
              <Field label="Date" value={date(document.issuedAt)} />
              <Field label={received ? "Received with thanks from" : "Billed to"} value={document.patient.fullName} className="col-span-2" />
              {received ? <Field label="The sum of Rupees" value={rupeesInWords(document.paidAmount)} className="col-span-2" /> : null}
            </section>
          </td></tr>
          <tr className="border-b-2 border-[var(--dw-dot)] font-[family-name:var(--font-document-display)] text-[12.6px] uppercase tracking-[.14em]">
            <th className="p-[6px] text-left font-[inherit]">Treatment</th>
            <th className="w-[150px] border-l-[1.5px] border-[var(--dw-rule)] p-[6px] text-right font-[inherit]">Amount ₹</th>
          </tr>
        </>}
      >
        {lines.map((line) => <tr key={line.id} className="b6-break-avoid border-b-[1.5px] border-[var(--dw-rule)] align-top text-[13.8px]">
          <td className="px-[6px] py-[7px]">
            {line.description}
            {/* Quantity and rate sit under the treatment rather than in columns
                of their own: the pad is a two-column sheet, and a single-unit
                line has nothing to say here. */}
            {line.quantity > 1 || line.discount ? <div className="text-[12px] italic text-[var(--dw-muted)]">{[line.quantity > 1 && `${line.quantity} × ₹${money(line.unitPrice)}`, line.discount && `less ₹${money(line.discount)}`].filter(Boolean).join(" · ")}</div> : null}
          </td>
          <td className="border-l-[1.5px] border-[var(--dw-rule)] px-[6px] py-[7px] text-right tabular-nums">{money(line.lineTotal)}</td>
        </tr>)}

        {document.discountAmount ? <InvoiceTotal label="Discount" value={-document.discountAmount} /> : null}
        {document.taxAmount ? <InvoiceTotal label="GST" value={document.taxAmount} /> : null}

        <tr className="b6-break-avoid border-t-2 border-[var(--dw-rule-strong)]">
          <td className="p-[9px] font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.14em]">Total</td>
          <td className="border-l-[1.5px] border-[var(--dw-rule)] p-[9px] text-right font-[family-name:var(--font-document-display)] text-[17px] tabular-nums">{money(document.totalAmount)}</td>
        </tr>

        <tr className="b6-break-avoid"><td colSpan={2} className="pt-[16px]">
          <div className="flex gap-[26px] border-t-[1.5px] border-[var(--dw-rule)] pt-[11px] text-[13.8px]">
            <Field label="Mode of payment" labelWidth="auto" value={document.payments.map((payment) => payment.method).filter((method, index, all) => all.indexOf(method) === index).join(", ")} className="flex-1" />
            <Field label="Balance" labelWidth="auto" value={document.outstandingAmount > 0 ? `₹${money(document.outstandingAmount)}` : "Nil"} className="flex-1" />
          </div>
        </td></tr>

        {document.payments.length ? <tr className="b6-break-avoid"><td colSpan={2} className="pt-[10px]">
          <div className="text-[11.4px] text-[var(--dw-muted)]">{document.payments.map((payment, index) => <span key={`${payment.paidAt.toISOString()}-${index}`} className="mr-[14px]">{date(payment.paidAt)} · {payment.method} · ₹{money(payment.amount)}{payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}</span>)}</div>
        </td></tr> : null}

        {document.diagnosis ? <tr className="b6-break-avoid"><td colSpan={2}><DocumentSection title="Diagnosis" text={document.diagnosis} /></td></tr> : null}
        {document.notes ? <tr className="b6-break-avoid"><td colSpan={2}><DocumentSection title="Notes" text={document.notes} /></td></tr> : null}
        {document.terms ? <tr className="b6-break-avoid"><td colSpan={2}><DocumentSection title="Terms" text={document.terms} /></td></tr> : null}
        {document.paymentDetails ? <tr className="b6-break-avoid"><td colSpan={2}><DocumentSection title="Payment details" text={document.paymentDetails} /></td></tr> : null}
      </DocumentPageTable>
    </DocumentFrame>
  );
}

function InvoiceTotal({ label, value }: { label: string; value: number }) {
  return (
    <tr className="b6-break-avoid border-b-[1.5px] border-[var(--dw-rule)] text-[13.8px] text-[var(--dw-muted)]">
      <td className="px-[6px] py-[7px]">{label}</td>
      <td className="border-l-[1.5px] border-[var(--dw-rule)] px-[6px] py-[7px] text-right tabular-nums">{money(value)}</td>
    </tr>
  );
}

function DocumentSection({ title, text }: { title: string; text: string }) {
  return (
    <section className="b6-break-avoid pt-[13px]">
      <span className="font-[family-name:var(--font-document-display)] text-[12.6px] uppercase tracking-[.14em]">{title}</span>
      <span className="ml-[12px] whitespace-pre-wrap text-[13.8px]">{text}</span>
    </section>
  );
}
