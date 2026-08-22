import type { ReactNode } from "react";
import { DocumentFrame, DocumentPageTable, DocumentTitle, Field, SectionRule, WriteLines } from "@/components/documents/B6ClinicalDocuments";
import type { ClinicDocumentBrand } from "@/lib/clinic-document";
import { patientAge } from "@/lib/prescription-core";
import { rupees } from "@/lib/format";
import { CONDITION_COLUMNS, resolveHistory } from "@/lib/medical-history";

const CONSENT_CLAUSES = [
  "The procedure necessary to treat my condition has been explained to me and I understand the same.",
  "I consent to the administration of the anaesthesia considered necessary or indicated in the judgement of the surgeon and / or anaesthetist.",
  "My consultant has explained to me the risks and possible consequences associated with the procedure, alternative procedures, the probability that the proposed treatment will be successful, and the prognosis if the proposed treatment is not given.",
  "I am aware that the practice of medicine and surgery is not an exact science, that there are risks involved, and that no guarantees have been made to me about the results of the treatment or procedure.",
  "I have also been informed by the consultant of other risks including, but not limited to, severe loss of blood, infection, cardiac arrest, pulmonary embolism and anaphylaxis, that are attendant to the performance of any surgical procedure and the administration of anaesthesia.",
];

export type CasePaperPatient = {
  fullName: string;
  phone: string;
  address?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | null;
};

export type CasePaperRecord = {
  conditions: string[];
  drugAllergies?: string | null;
  medications?: string | null;
  bloodPressure?: string | null;
  weightKg?: string | null;
  dentalHistory?: string | null;
  otherHistory?: string | null;
  treatmentDone?: string | null;
  estimateAmount?: number | null;
  consentGiven: boolean;
  consentNotes?: string | null;
  completedAt?: Date | null;
  patientSignature?: string | null;
  guardianSignature?: string | null;
};

const date = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

/**
 * What a row says on a record somebody has already filled in.
 *
 * Words, not boxes: a tick-box is for a pad you write on, and on a finished
 * record it makes a reader work out whether an empty box means "no" or "nobody
 * filled this in". YES is a reported condition. N/A covers everything else —
 * and covers it honestly, because unlike "No" it does not put a denial on the
 * record on behalf of a patient who may simply never have been asked.
 */
function Answer({ reported }: { reported: boolean }) {
  return reported
    ? <span className="shrink-0 tracking-[.08em]">YES</span>
    : <span className="shrink-0 tracking-[.08em] text-[var(--dw-muted)]">N/A</span>;
}

/**
 * One column of the grid. `start` continues the numbering across the three
 * columns so the list reads 1 to 15.
 *
 * `answers` absent is the blank pad: empty boxes, ticked by hand at the desk.
 */
function ChecklistColumn({
  items,
  start,
  answers,
}: {
  items: { key: string; clinical: string }[];
  start: number;
  answers?: Map<string, boolean>;
}) {
  return (
    <div>
      <div className="flex justify-between gap-[6px] border-b-[1.5px] border-[var(--dw-rule)] pb-[3px] text-[11px] tracking-[.06em]">
        <span>I have / had the following</span>
        {answers ? null : <span className="inline-flex shrink-0 gap-[6px]"><span>Yes</span><span>No</span></span>}
      </div>
      {/* A label is allowed to wrap. It used to be `whitespace-nowrap` to keep
          the three columns in vertical register, but that made the longest
          condition ("Abnormal Bleeding / Bruising") the minimum width of ALL
          three tracks — the sheet then needed ~184mm of a 186mm page and lost
          an edge the moment anyone widened the print margins. `min-h` holds
          the register instead, and holds it for real: the column heading above
          was never nowrap and always could wrap. */}
      {items.map((item, index) => (
        <div key={item.key} className="flex min-h-[1.5em] items-baseline justify-between gap-[6px] py-px">
          <span>{start + index}. {item.clinical}</span>
          {answers
            ? <Answer reported={answers.get(item.key) === true} />
            : <span className="inline-flex shrink-0 gap-[6px]"><span>☐</span><span>☐</span></span>}
        </div>
      ))}
    </div>
  );
}

function HistoryGrid({ answers }: { answers?: Map<string, boolean> }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-[2%] pt-[4px] text-[11.6px]">
      {CONDITION_COLUMNS.map((column, index) => (
        <ChecklistColumn key={index} items={column} start={index * column.length + 1} answers={answers} />
      ))}
    </div>
  );
}

function ConsentClauses({ doctorName }: { doctorName?: string | null }) {
  // The clause already says "Dr."; a principal stored as "Dr. Deepika Jain
  // Mandot" would otherwise print the honorific twice.
  const name = doctorName?.replace(/^\s*dr\.?\s+/i, "").trim();
  return (
    <ol className="mt-[5px] list-decimal pl-[18px] text-[11.4px] leading-[1.3]">
      <li className="pb-[2px]">
        I authorise Dr.{" "}
        <span className="b6-fill-line inline-block w-[38%] min-w-[90px] align-bottom">{name || " "}</span>{" "}
        , his / her associates and such assistants as may be selected by him / her, to treat or perform the dental procedure and administer the anaesthesia connected thereof —{" "}
        <span className="b6-fill-line inline-block w-[46%] min-w-[90px] align-bottom"> </span>{" "}
        (consultant&rsquo;s description of the procedure) — on me / my child.
      </li>
      {CONSENT_CLAUSES.map((clause) => <li key={clause} className="pb-[1px]">{clause}</li>)}
    </ol>
  );
}

function CasePaperSheet({ clinic, signatures, children }: { clinic: ClinicDocumentBrand; signatures: ReactNode; children: ReactNode }) {
  return (
    <DocumentFrame clinic={clinic}>
      {/* No footer band: the signatures ARE the foot of a consent form, and
          they are passed as bottomRows so they sit on the bottom rule of the
          page rather than wherever the clauses happen to stop. fillPage keeps
          the spacer alive in print to push them down there. */}
      <DocumentPageTable clinic={clinic} fillPage bottomRows={signatures}>
        <tr><td><DocumentTitle>Patient Record &amp; Consent</DocumentTitle></td></tr>
        {children}
      </DocumentPageTable>
    </DocumentFrame>
  );
}

/** The blank pad: printed in a stack and filled in by hand at the desk. */
export function BlankCasePaperDocument({ clinic }: { clinic: ClinicDocumentBrand }) {
  return (
    <CasePaperSheet
      clinic={clinic}
      signatures={
        <tr className="b6-break-avoid"><td className="pt-[10px]">
          <div className="grid grid-cols-3 gap-[26px]">
            {["Patient's signature", "Doctor's signature", "Date"].map((label) => (
              <div key={label} className="border-t-2 border-[var(--dw-rule-strong)] pt-[4px] uppercase tracking-[.1em]">{label}</div>
            ))}
          </div>
        </td></tr>
      }
    >
      <tr className="b6-break-avoid"><td>
        <section className="grid grid-cols-[minmax(0,1fr)_32%] gap-x-[22px] gap-y-[11px] border-b-[1.5px] border-[var(--dw-rule)] pb-[10px]">
          <Field label="Name" labelWidth="78px" />
          <Field label="Date" labelWidth="auto" />
          <Field label="Address" labelWidth="78px" />
          <Field label="Sex" labelWidth="auto" value="M / F" />
          <Field label="Tel. No." labelWidth="78px" />
          <Field label="D.O.B." labelWidth="auto" />
        </section>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Medical History</SectionRule>
        <HistoryGrid />
        <div className="flex gap-[20px] pt-[8px]">
          <Field label="16. Others" labelWidth="auto" className="flex-[1.6]" />
          <Field label="B.P." labelWidth="auto" className="flex-[.7]" />
          <Field label="Weight" labelWidth="auto" className="flex-[.7]" />
        </div>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Dental History</SectionRule>
        <div className="pt-[5px]"><WriteLines count={2} /></div>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule right="Estimate ₹">Dental Treatment</SectionRule>
        <div className="grid grid-cols-[minmax(0,1fr)_26%] gap-x-[22px] pt-[5px]">
          <div><WriteLines count={4} /></div>
          <div><WriteLines count={4} /></div>
        </div>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Consent by the Patient</SectionRule>
        <ConsentClauses />
      </td></tr>
    </CasePaperSheet>
  );
}

/**
 * The same sheet, carrying a record somebody has already filled in — the
 * printable form of what the case-paper page shows on screen.
 */
export function CasePaperDocument({ clinic, patient, record }: { clinic: ClinicDocumentBrand; patient: CasePaperPatient; record: CasePaperRecord }) {
  const signedOn = record.completedAt ?? null;
  // Age as of the day the form was signed — the same call the screen header
  // makes, so the two renderings of this record can never disagree by a year.
  const age = patientAge(patient.dateOfBirth ?? null, signedOn ?? undefined);
  const { ticked, unmatched } = resolveHistory(record.conditions);
  // Reported or not, and nothing in between. Because the "not" case prints N/A
  // rather than No, this reads correctly whether the row was answered in the
  // negative or was never on the form the patient saw — which is why records
  // predating the unified question list need no caveat of their own.
  const answers = new Map([...ticked].map((key) => [key, true] as const));
  const extras = [
    record.drugAllergies && `Allergies — ${record.drugAllergies}`,
    record.medications && `Current medication — ${record.medications}`,
    record.otherHistory,
    // A tick from a retired list that has no row any more — carried through
    // rather than dropped, since it is still something the patient told us.
    unmatched.length ? `Also reported — ${unmatched.join(", ")}` : null,
  ].filter(Boolean) as string[];

  return (
    <CasePaperSheet
      clinic={clinic}
      signatures={
        <tr className="b6-break-avoid"><td className="pt-[16px]">
          {/* A guardian gets their own line whenever one signed, rather than
              being folded into the patient's. On a minor's consent those are
              two different people and the guardian's is the signature the
              consent legally rests on — picking one of the two to print would
              drop it from the record entirely. */}
          <div className={`grid gap-[26px] ${record.guardianSignature ? "grid-cols-4" : "grid-cols-3"}`}>
            <SignatureLine label="Patient's signature" image={record.patientSignature} alt={`${patient.fullName}'s signature`} />
            {record.guardianSignature ? <SignatureLine label="Guardian's signature" image={record.guardianSignature} alt="Guardian's signature" /> : null}
            <SignatureLine label="Doctor's signature" />
            <SignatureLine label="Date" caption={signedOn ? date(signedOn) : null} />
          </div>
        </td></tr>
      }
    >
      <tr className="b6-break-avoid"><td>
        <section className="grid grid-cols-[minmax(0,1fr)_32%] gap-x-[22px] gap-y-[11px] border-b-[1.5px] border-[var(--dw-rule)] pb-[10px]">
          <Field label="Name" labelWidth="78px" value={patient.fullName} />
          <Field label="Date" labelWidth="auto" value={signedOn ? date(signedOn) : "Not recorded"} />
          <Field label="Address" labelWidth="78px" value={patient.address} />
          <Field label="Sex" labelWidth="auto" value={patient.gender} />
          <Field label="Tel. No." labelWidth="78px" value={patient.phone} />
          <Field label="D.O.B." labelWidth="auto" value={patient.dateOfBirth ? `${date(patient.dateOfBirth)}${age === null ? "" : ` (${age} y)`}` : null} />
        </section>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Medical History</SectionRule>
        <HistoryGrid answers={answers} />
        {extras.length ? <p className="pt-[6px]">{extras.join(" · ")}</p> : null}
        {record.bloodPressure || record.weightKg ? (
          <div className="flex gap-[20px] pt-[8px]">
            {record.bloodPressure ? <Field label="B.P." labelWidth="auto" value={record.bloodPressure} className="flex-[.7]" /> : null}
            {record.weightKg ? <Field label="Weight" labelWidth="auto" value={`${record.weightKg} kg`} className="flex-[.7]" /> : null}
          </div>
        ) : null}
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Dental History</SectionRule>
        <p className="whitespace-pre-wrap pt-[5px]">{record.dentalHistory || "Nothing recorded."}</p>
      </td></tr>

      {record.treatmentDone || record.estimateAmount ? (
        <tr className="b6-break-avoid"><td className="pt-[6px]">
          <SectionRule right="Estimate ₹">Dental Treatment</SectionRule>
          <div className="grid grid-cols-[minmax(0,1fr)_26%] gap-x-[22px] pt-[5px]">
            <p className="whitespace-pre-wrap">{record.treatmentDone || " "}</p>
            <p className="text-right tabular-nums">{record.estimateAmount ? rupees(record.estimateAmount) : " "}</p>
          </div>
        </td></tr>
      ) : null}

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Consent by the Patient</SectionRule>
        {record.consentGiven ? <ConsentClauses doctorName={clinic.principalName} /> : <p className="pt-[7px] text-[11.4px]">Consent was not given.</p>}
        {record.consentNotes ? <p className="pt-[4px] text-[11.4px] text-[var(--dw-muted)]">{record.consentNotes}</p> : null}
      </td></tr>

    </CasePaperSheet>
  );
}

function SignatureLine({ label, image, alt, caption }: { label: string; image?: string | null; alt?: string; caption?: string | null }) {
  return (
    <div>
      <div className="flex h-[34px] items-end">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a stored data: URI, not an optimizable remote asset
          <img src={image} alt={alt} className="max-h-[34px] max-w-full object-contain object-left" />
        ) : caption ? (
          <span className="tabular-nums">{caption}</span>
        ) : null}
      </div>
      <div className="border-t-2 border-[var(--dw-rule-strong)] pt-[4px] uppercase tracking-[.1em]">{label}</div>
    </div>
  );
}
