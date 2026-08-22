import type { ReactNode } from "react";
import type { BillingDocument } from "@/lib/billing-document";
import type { CasePaperPatient, CasePaperRecord } from "@/components/documents/CasePaperDocument";
import type { PrescriptionDocumentData } from "@/components/documents/B6ClinicalDocuments";
import { conditionLabel, resolveHistory } from "@/lib/medical-history";
import { medicationDetail } from "@/lib/prescription-core";
import { rupees } from "@/lib/format";

/**
 * What a clinical document looks like ON A SCREEN.
 *
 * The A4 letterhead is a piece of paper: 210mm wide, fixed, and on a 1720px
 * workspace it sits as a narrow column with half the screen empty either side.
 * That is right for the printer and wrong for the person reading it at the
 * desk, so the sheet is now reserved for print and for the copy a patient gets
 * on WhatsApp, and these views are what staff actually look at.
 *
 * Same record, two renderings, and neither pretends to be the other.
 */

const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function ScreenSheet({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-5 print:hidden">{children}</div>;
}

export function ScreenHeader({ eyebrow, title, meta, aside }: { eyebrow: string; title: string; meta?: string[]; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">{eyebrow}</p>
        <h1 className="mt-1 text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold text-heading">{title}</h1>
        {meta?.length ? <p className="mt-1 text-[length:var(--text-secondary)] text-text-muted">{meta.filter(Boolean).join(" · ")}</p> : null}
      </div>
      {aside ? <div className="shrink-0 text-right">{aside}</div> : null}
    </header>
  );
}

export function ScreenSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
      <div>
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{title}</h2>
        {note ? <p className="mt-0.5 text-[length:var(--text-secondary)] text-text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Label over value, wrapping into as many columns as the width allows. */
export function ScreenFacts({ items }: { items: Array<[string, ReactNode]> }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (!shown.length) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-semibold tracking-[0.1em] text-text-muted uppercase">{label}</dt>
          <dd className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Pills({ values, tone = "warning" }: { values: string[]; tone?: "warning" | "muted" }) {
  const style = tone === "warning"
    ? "border-warning-border bg-warning-bg text-warning"
    : "border-border bg-muted text-text-muted";
  return (
    <ul className="flex flex-wrap gap-2">
      {values.map((value) => (
        <li key={value} className={`rounded-pill border px-3 py-1 text-[length:var(--text-secondary)] font-semibold ${style}`}>{value}</li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- case paper */

export function CasePaperScreen({ patient, record }: { patient: CasePaperPatient; record: CasePaperRecord }) {
  const signedOn = record.completedAt ?? null;
  const { ticked, unmatched } = resolveHistory(record.conditions);
  // Only what was reported. Fifteen rows of N/A is the right answer on a sheet
  // that has to stand as a complete record; on screen it is fifteen lines of
  // nothing between the reader and the two facts that matter.
  const reported = [...ticked].map((key) => conditionLabel(key) ?? key).concat(unmatched);
  // The hedge is attached in both cases, including when nothing was reported.
  // "Nothing reported" on its own reads as a documented negative — a clean bill
  // of health — when some of those questions may never have been on the form
  // this patient saw. The printed sheet says N/A for exactly that reason.
  const hedge = reported.length
    ? `${reported.length} reported · everything else answered no or not asked`
    : "Nothing reported · every condition answered no or not asked";

  return (
    <>
      <ScreenSection title="Medical history" note={hedge}>
        {reported.length ? <Pills values={reported} /> : <p className="text-[length:var(--text-body)] text-text-muted">Nothing reported.</p>}
        <ScreenFacts
          items={[
            ["Allergies", record.drugAllergies || "None recorded"],
            ["Current medication", record.medications || "None recorded"],
            ["Blood pressure", record.bloodPressure],
            ["Weight", record.weightKg ? `${record.weightKg} kg` : null],
            ["Dental history", record.dentalHistory],
            ["Anything else", record.otherHistory],
          ]}
        />
      </ScreenSection>

      {record.treatmentDone || record.estimateAmount ? (
        <ScreenSection title="Dental treatment">
          <ScreenFacts
            items={[
              ["Treatment", record.treatmentDone],
              ["Estimate", record.estimateAmount ? rupees(record.estimateAmount) : null],
            ]}
          />
        </ScreenSection>
      ) : null}

      <ScreenSection title="Consent">
        <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
          {record.consentGiven ? "Consented to examination and treatment at this clinic." : "Consent was not given."}
        </p>
        {record.consentNotes ? <p className="text-[length:var(--text-secondary)] text-text-muted">{record.consentNotes}</p> : null}
        <p className="text-xs text-text-muted">{signedOn ? `Submitted ${date(signedOn)}` : "Submission time not recorded"}</p>
        {record.patientSignature || record.guardianSignature ? (
          <div className="flex flex-wrap gap-6 pt-1">
            {record.patientSignature ? (
              <figure>
                <figcaption className="mb-1.5 text-xs font-semibold text-heading">{patient.fullName}</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element -- a stored data: URI, not an optimizable remote asset */}
                <img src={record.patientSignature} alt={`${patient.fullName}'s signature`} className="h-[90px] w-[300px] max-w-full rounded-control border border-border bg-white object-contain" />
              </figure>
            ) : null}
            {record.guardianSignature ? (
              <figure>
                <figcaption className="mb-1.5 text-xs font-semibold text-heading">Guardian</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element -- a stored data: URI, not an optimizable remote asset */}
                <img src={record.guardianSignature} alt="Guardian's signature" className="h-[90px] w-[300px] max-w-full rounded-control border border-border bg-white object-contain" />
              </figure>
            ) : null}
          </div>
        ) : null}
      </ScreenSection>
    </>
  );
}

/* -------------------------------------------------------------- prescription */

export function PrescriptionScreen({ prescription, principalName }: { prescription: PrescriptionDocumentData; principalName?: string | null }) {
  const issuedAt = prescription.issuedAt || prescription.prescribedOn;
  // Same fallback chain the sheet's signature block uses. Name and
  // qualification are separate facts so a present qualification cannot stand in
  // for a missing name — the two surfaces named different people otherwise.
  const prescriberName = prescription.providerNameSnapshot || principalName || "Clinic dentist";
  const legacy = prescription.medicationItems.length === 0 ? prescription.medicines.trim() : "";
  // A free-text block holding four medicines is not "1 on this script".
  const legacyCount = legacy ? legacy.split(/\n+/).filter((line) => line.trim()).length : 0;
  const count = prescription.medicationItems.length || legacyCount;

  return (
    <>
      {prescription.allergySnapshot ? (
        <p role="alert" className="rounded-card border border-danger-border bg-danger-bg px-5.5 py-3.5 text-[length:var(--text-body)] font-semibold text-danger">
          Allergies — {prescription.allergySnapshot}
        </p>
      ) : null}

      <ScreenSection title="The script">
        <ScreenFacts
          items={[
            ["Diagnosis", prescription.diagnosis || "Not specified"],
            ["Issued", date(issuedAt)],
            ["Prescriber", prescriberName],
            ["Qualification", prescription.providerQualificationSnapshot],
            ["Registration", prescription.providerRegistrationSnapshot],
          ]}
        />
      </ScreenSection>

      <ScreenSection title="Medicines" note={`${count} on this script`}>
        {prescription.medicationItems.length ? (
          <ul className="flex flex-col gap-2.5">
            {prescription.medicationItems.map((item, index) => (
              <li key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-control border border-border p-3.5">
                <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground tabular-nums">{index + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-heading">
                    {item.genericName} {item.strength} {item.dosageForm}{item.brandName ? ` (${item.brandName})` : ""}
                  </p>
                  <p className="mt-1 text-[length:var(--text-secondary)] text-text-muted">
                    {[`${item.dose} ${item.doseUnit}`, item.frequency, item.mealRelation, item.timing, item.duration, item.route].filter(Boolean).join(" · ")}
                  </p>
                  {/* The same small print the sheet carries, from the same
                      helper. "Only if needed", the dose ceiling and "do not
                      substitute" are what a chemist acts on — a screen that
                      omits them is showing a different prescription. */}
                  {medicationDetail(item) ? <p className="mt-1 text-[length:var(--text-secondary)] text-foreground">{medicationDetail(item)}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : legacy ? (
          <p className="whitespace-pre-wrap rounded-control border border-warning-border bg-warning-bg p-3.5 text-[length:var(--text-body)]">{legacy}</p>
        ) : (
          <p className="text-[length:var(--text-body)] text-text-muted">No medicines on this script.</p>
        )}
      </ScreenSection>

      {prescription.instructions || prescription.nextVisit ? (
        <ScreenSection title="Advice and follow-up">
          <ScreenFacts
            items={[
              ["Advice", prescription.instructions ? <span className="whitespace-pre-wrap">{prescription.instructions}</span> : null],
              ["Next visit", prescription.nextVisit],
            ]}
          />
        </ScreenSection>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- invoice */

export function InvoiceScreen({ document: doc }: { document: BillingDocument }) {
  const lines = doc.lineItems.length ? doc.lineItems : [{ id: 0, description: "Dental treatment and clinical services", quantity: 1, unitPrice: doc.totalAmount, discount: 0, taxPercent: 0, lineTotal: doc.totalAmount }];

  return (
    <>
      <ScreenSection title="Treatment">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[length:var(--text-dense)] leading-[var(--text-dense-lh)]">
            <thead>
              <tr className="bg-card text-left">
                <th scope="col" className="border-b-2 border-border px-3 py-2.5 text-[length:var(--text-micro)] font-bold tracking-[0.14em] text-heading uppercase">Treatment</th>
                <th scope="col" className="w-24 border-b-2 border-border px-3 py-2.5 text-right text-[length:var(--text-micro)] font-bold tracking-[0.14em] text-heading uppercase">Qty</th>
                <th scope="col" className="w-32 border-b-2 border-border px-3 py-2.5 text-right text-[length:var(--text-micro)] font-bold tracking-[0.14em] text-heading uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b border-border">
                  <td className="px-3 py-2.5 break-words">{line.description}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rupees(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto flex w-full max-w-sm flex-col gap-1.5 text-[length:var(--text-body)]">
          {doc.discountAmount ? <Row label="Discount" value={rupees(-doc.discountAmount)} /> : null}
          {doc.taxAmount ? <Row label="GST" value={rupees(doc.taxAmount)} /> : null}
          <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-2">
            <span className="font-semibold text-heading">Total</span>
            <strong className="text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums text-heading">{rupees(doc.totalAmount)}</strong>
          </div>
          {doc.paidAmount ? <Row label="Received" value={rupees(doc.paidAmount)} /> : null}
          {doc.outstandingAmount > 0
            ? <Row label="Balance due" value={rupees(doc.outstandingAmount)} strong />
            : <p className="pt-1 text-right font-semibold text-success">Paid in full — thank you.</p>}
        </div>
      </ScreenSection>

      {doc.payments.length ? (
        <ScreenSection title="Payments received">
          <ul className="flex flex-col">
            {doc.payments.map((payment, index) => (
              <li key={`${payment.paidAt.toISOString()}-${index}`} className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
                <span className="text-[length:var(--text-body)] text-foreground">
                  {date(payment.paidAt)} · {payment.method}{payment.referenceNumber ? ` · Ref ${payment.referenceNumber}` : ""}
                </span>
                <strong className="tabular-nums">{rupees(payment.amount)}</strong>
              </li>
            ))}
          </ul>
        </ScreenSection>
      ) : null}

      {doc.diagnosis || doc.notes || doc.terms || doc.paymentDetails ? (
        <ScreenSection title="On the bill">
          <ScreenFacts
            items={[
              ["What it was for", doc.diagnosis],
              ["Notes", doc.notes],
              ["Terms", doc.terms],
              ["Payment details", doc.paymentDetails],
            ]}
          />
        </ScreenSection>
      ) : null}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={strong ? "font-semibold text-heading" : "text-text-muted"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-heading" : ""}`}>{value}</span>
    </div>
  );
}
