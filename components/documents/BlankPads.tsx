import { DocumentFrame, DocumentPageTable, DocumentTitle, Field, SignatureBlock, WriteLines } from "@/components/documents/B6ClinicalDocuments";
import { type ClinicDocumentBrand, clinicDocumentName } from "@/lib/clinic-document";

/**
 * The treatments the receipt pad lists, in the clinic's own order. This is the
 * printed stationery's list, not the bookable-services list — a receipt names
 * the chargeable procedures a dentist ticks off, which is a different set from
 * what a patient can book online. Edit here to re-cut the pad.
 */
const RECEIPT_TREATMENTS = [
  "Consulting",
  "Scaling & Polishing",
  "Extractions",
  "Silver Fillings",
  "Tooth Colour Fillings",
  "Root Canal Treatment",
  "Fixed Partial Denture",
  "Removable Denture",
  "Minor Surgery",
  "X-Rays",
  "Other",
];

/** The letterspaced caps that head a block on a blank pad. */
function PadHeading({ children }: { children: string }) {
  return <div className="mb-[7px] font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.14em] text-[var(--dw-accent)]">{children}</div>;
}

export function BlankPrescriptionDocument({ clinic }: { clinic: ClinicDocumentBrand }) {
  return (
    <DocumentFrame clinic={clinic}>
      <DocumentPageTable
        clinic={clinic}
        footerLeft="Not valid for medico-legal purposes. Please bring this prescription and all previous records on every visit."
        footerRight={<SignatureBlock name={clinic.principalName || clinicDocumentName(clinic)} detail={[clinic.principalCredentials?.split("\n")[0], clinic.registrationNumber && `Reg. No. ${clinic.registrationNumber}`].filter(Boolean).join(" · ") || null} />}
      >
        <tr><td>
          <section className="grid grid-cols-2 gap-x-[26px] gap-y-[9px] border-b-[1.5px] border-[var(--dw-rule)] py-[12px] text-[13.8px]">
            <Field label="Patient" labelWidth="64px" />
            <Field label="Date" labelWidth="64px" />
            <Field label="OPD No." labelWidth="64px" />
            <Field label="Mobile" labelWidth="64px" />
          </section>
        </td></tr>

        <tr><td className="border-b-[1.5px] border-[var(--dw-rule)] py-[13px]">
          <PadHeading>Diagnosis</PadHeading>
          <WriteLines count={2} height={17} />
        </td></tr>

        <tr><td className="pt-[14px]">
          <div className="grid grid-cols-[minmax(0,1fr)_16%_30%] border-b-2 border-[var(--dw-dot)] font-[family-name:var(--font-document-display)] text-[13.2px] uppercase tracking-[.12em] text-[var(--dw-muted)]">
            <span className="px-[6px] py-[5px]">Medicine</span>
            <span className="px-[6px] py-[5px] text-center">Dosage</span>
            <span className="px-[6px] py-[5px]">Timing · Duration</span>
          </div>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="grid h-[30px] grid-cols-[minmax(0,1fr)_16%_30%] border-b-[1.5px] border-[var(--dw-rule)]">
              <span />
              <span className="border-l-[1.5px] border-[var(--dw-rule)]" />
              <span className="border-l-[1.5px] border-[var(--dw-rule)]" />
            </div>
          ))}
        </td></tr>

        <tr><td className="pt-[16px]">
          <PadHeading>Advice</PadHeading>
          <WriteLines count={3} height={17} />
        </td></tr>

        <tr><td className="pt-[16px]">
          <div className="flex items-baseline gap-[12px] border-t-[1.5px] border-[var(--dw-rule)] pt-[10px] text-[13.8px]">
            <span className="whitespace-nowrap font-[family-name:var(--font-document-display)] text-[14.4px] uppercase tracking-[.14em] text-[var(--dw-accent)]">Next visit</span>
            <span className="b6-fill-line h-[17px] flex-1" />
          </div>
        </td></tr>
      </DocumentPageTable>
    </DocumentFrame>
  );
}

export function BlankReceiptDocument({ clinic }: { clinic: ClinicDocumentBrand }) {
  return (
    <DocumentFrame clinic={clinic}>
      <DocumentPageTable
        clinic={clinic}
        footerLeft="Kindly retain this receipt for your records. Fees once paid are not refundable."
        footerRight={<SignatureBlock name={`For ${clinicDocumentName(clinic)}`} detail={[clinic.principalName, clinic.registrationNumber && `Reg. No. ${clinic.registrationNumber}`].filter(Boolean).join(" · ") || null} />}
        columns={2}
      >
        <tr><td colSpan={2}><DocumentTitle>Receipt</DocumentTitle></td></tr>

        <tr><td colSpan={2}>
          <section className="grid grid-cols-2 gap-x-[26px] gap-y-[11px] border-b-[1.5px] border-[var(--dw-rule)] pb-[13px] text-[13.8px]">
            <Field label="No." />
            <Field label="Date" />
            <Field label="Received with thanks from" className="col-span-2" />
            <Field label="The sum of Rupees" className="col-span-2" />
          </section>
        </td></tr>

        <tr className="border-b-2 border-[var(--dw-dot)] font-[family-name:var(--font-document-display)] text-[12.6px] uppercase tracking-[.14em]">
          <th className="p-[6px] text-left font-[inherit]">Treatment</th>
          <th className="w-[22%] border-l-[1.5px] border-[var(--dw-rule)] p-[6px] text-right font-[inherit]">Amount ₹</th>
        </tr>

        {RECEIPT_TREATMENTS.map((treatment) => (
          <tr key={treatment} className="border-b-[1.5px] border-[var(--dw-rule)] text-[13.8px]">
            <td className="px-[6px] py-[4.5px]">{treatment}</td>
            <td className="border-l-[1.5px] border-[var(--dw-rule)]" />
          </tr>
        ))}

        <tr className="border-t-2 border-[var(--dw-rule-strong)]">
          <td className="p-[7px] font-[family-name:var(--font-document-display)] text-[15.6px] uppercase tracking-[.14em]">Total</td>
          <td className="border-l-[1.5px] border-[var(--dw-rule)]" />
        </tr>

        <tr><td colSpan={2} className="pt-[16px]">
          <div className="flex gap-[26px] border-t-[1.5px] border-[var(--dw-rule)] pt-[11px] text-[13.8px]">
            <Field label="Mode of payment" labelWidth="auto" className="flex-1" />
            <Field label="Balance" labelWidth="auto" className="flex-1" />
          </div>
        </td></tr>

        <tr><td colSpan={2} className="pt-[14px]">
          <div className="mb-[8px] font-[family-name:var(--font-document-display)] text-[12.6px] uppercase tracking-[.14em]">Diagnosis</div>
          <WriteLines count={2} height={19} />
        </td></tr>
      </DocumentPageTable>
    </DocumentFrame>
  );
}
