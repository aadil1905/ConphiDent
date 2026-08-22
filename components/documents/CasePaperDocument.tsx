import type { ReactNode } from "react";
import { DocumentFrame, DocumentPageTable, DocumentTitle, Field, SectionRule, WriteLines } from "@/components/documents/B6ClinicalDocuments";
import type { ClinicDocumentBrand } from "@/lib/clinic-document";
import { rupees } from "@/lib/format";
import { CONDITION_COLUMNS, parseAskedKeys, resolveHistory } from "@/lib/medical-history";

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
  /** Raw JSON of the keys this patient was shown; null on pre-unification rows. */
  conditionsAsked?: string | null;
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

/** Exact to the day, unlike the year-subtraction the screen page used. */
function ageOn(dateOfBirth: Date, on: Date) {
  let years = on.getFullYear() - dateOfBirth.getFullYear();
  const month = on.getMonth() - dateOfBirth.getMonth();
  if (month < 0 || (month === 0 && on.getDate() < dateOfBirth.getDate())) years -= 1;
  return years;
}

/**
 * Yes and No, or neither.
 *
 * `null` leaves both boxes empty, which is what a row nobody was asked has to
 * look like — the same as an unanswered row on a hand-filled pad. Ticking "No"
 * there would put an answer on the record that the patient never gave.
 */
function Tick({ answer }: { answer: boolean | null }) {
  const yes = answer === true ? "☑" : "☐";
  const no = answer === false ? "☑" : "☐";
  return <span className="shrink-0">{yes}&nbsp;&nbsp;{no}</span>;
}

/**
 * One column of the printed grid. `start` continues the numbering across the
 * three columns so the list reads 1 to 15.
 *
 * `answers` is absent on a blank pad (every box empty, to be ticked by hand)
 * and present on a filled one.
 */
function ChecklistColumn({
  items,
  start,
  answers,
}: {
  items: { key: string; clinical: string }[];
  start: number;
  answers?: Map<string, boolean | null>;
}) {
  return (
    <div>
      <div className="flex justify-between border-b-[1.5px] border-[var(--dw-rule)] pb-[3px] text-[11px] tracking-[.06em]">
        <span>I have / had the following</span>
        <span>Yes&nbsp;&nbsp;No</span>
      </div>
      {/* `whitespace-nowrap`, and the size chosen so the longest condition
          ("Abnormal Bleeding / Bruising") clears its column. A wrapped row
          would push the rest of that column down and leave the three columns
          reading out of step with each other. */}
      {items.map((item, index) => (
        <div key={item.key} className="flex justify-between gap-[6px] py-px whitespace-nowrap">
          <span>{start + index}. {item.clinical}</span>
          <Tick answer={answers ? answers.get(item.key) ?? null : null} />
        </div>
      ))}
    </div>
  );
}

function HistoryGrid({ answers }: { answers?: Map<string, boolean | null> }) {
  return (
    <div className="grid grid-cols-3 gap-x-[14px] pt-[4px] text-[11.6px]">
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
        <span className="b6-fill-line inline-block min-w-[170px] align-bottom">{name || " "}</span>{" "}
        , his / her associates and such assistants as may be selected by him / her, to treat or perform the dental procedure and administer the anaesthesia connected thereof —{" "}
        <span className="b6-fill-line inline-block min-w-[230px] align-bottom"> </span>{" "}
        (consultant&rsquo;s description of the procedure) — on me / my child.
      </li>
      {CONSENT_CLAUSES.map((clause) => <li key={clause} className="pb-[1px]">{clause}</li>)}
    </ol>
  );
}

function CasePaperSheet({ clinic, children }: { clinic: ClinicDocumentBrand; children: ReactNode }) {
  return (
    <DocumentFrame clinic={clinic}>
      {/* No footer at all. On a consent form the signatures that matter are the
          patient's and the guardian's, and they have their own ruled block at
          the foot of the sheet — a clinic countersignature would muddle that.
          The form is also set to fill an A4 page exactly, so a footer band is
          the difference between one sheet and two. */}
      <DocumentPageTable clinic={clinic}>
        <tr><td><DocumentTitle>Patient Record &amp; Consent</DocumentTitle></td></tr>
        {children}
      </DocumentPageTable>
    </DocumentFrame>
  );
}

/** The blank pad: printed in a stack and filled in by hand at the desk. */
export function BlankCasePaperDocument({ clinic }: { clinic: ClinicDocumentBrand }) {
  return (
    <CasePaperSheet clinic={clinic}>
      <tr className="b6-break-avoid"><td>
        <section className="grid grid-cols-[1fr_210px] gap-x-[22px] gap-y-[11px] border-b-[1.5px] border-[var(--dw-rule)] pb-[10px]">
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
        <div className="grid grid-cols-[1fr_180px] gap-x-[22px] pt-[5px]">
          <div><WriteLines count={4} /></div>
          <div><WriteLines count={4} /></div>
        </div>
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[6px]">
        <SectionRule>Consent by the Patient</SectionRule>
        <ConsentClauses />
      </td></tr>

      <tr className="b6-break-avoid"><td className="pt-[10px]">
        <div className="grid grid-cols-3 gap-[26px]">
          {["Patient's signature", "Guardian's signature", "Date"].map((label) => (
            <div key={label} className="border-t-2 border-[var(--dw-rule-strong)] pt-[4px] uppercase tracking-[.1em]">{label}</div>
          ))}
        </div>
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
  const age = patient.dateOfBirth ? ageOn(patient.dateOfBirth, signedOn ?? new Date()) : null;
  const { ticked, unmatched } = resolveHistory(record.conditions);
  // Which rows this record can be ticked against at all. Recorded on the intake
  // row since the two question lists were unified; null for anything filled in
  // before that, where there is no way to know whether the patient saw twelve
  // questions or fifteen.
  const asked = parseAskedKeys(record.conditionsAsked);
  // With the asked list, every row it covers gets a definite Yes or No. Without
  // it, only what the patient actually reported can be marked — the rest stay
  // blank, meaning "not answered", exactly as an unticked row on a paper pad.
  const answers = asked
    ? new Map(asked.map((key) => [key, ticked.has(key)] as const))
    : new Map([...ticked].map((key) => [key, true] as const));
  const extras = [
    record.drugAllergies && `Allergies — ${record.drugAllergies}`,
    record.medications && `Current medication — ${record.medications}`,
    record.otherHistory,
    // A tick from a retired list that has no row any more — carried through
    // rather than dropped, since it is still something the patient told us.
    unmatched.length ? `Also reported — ${unmatched.join(", ")}` : null,
  ].filter(Boolean) as string[];

  return (
    <CasePaperSheet clinic={clinic}>
      <tr className="b6-break-avoid"><td>
        <section className="grid grid-cols-[1fr_210px] gap-x-[22px] gap-y-[11px] border-b-[1.5px] border-[var(--dw-rule)] pb-[10px]">
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
        {/* Said plainly on the sheet itself, because a reader cannot otherwise
            tell an empty box that means "no" from one that means "never
            asked". Only shown for records taken before the two question lists
            were unified, which are the only ones that can be ambiguous. */}
        {asked ? null : (
          <p className="pt-[4px] text-[10.5px] text-[var(--dw-muted)]">
            Filled on an earlier version of this form. Only what the patient reported is marked; the remaining rows were not put to them.
          </p>
        )}
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
          <div className="grid grid-cols-[1fr_180px] gap-x-[22px] pt-[5px]">
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

      <tr className="b6-break-avoid"><td className="pt-[16px]">
        <div className="grid grid-cols-3 gap-[26px]">
          <SignatureLine label="Patient's signature" image={record.patientSignature} alt={`${patient.fullName}'s signature`} />
          <SignatureLine label="Guardian's signature" image={record.guardianSignature} alt="Guardian's signature" />
          <SignatureLine label="Date" caption={signedOn ? date(signedOn) : null} />
        </div>
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
