/**
 * What has to be read before treating this patient, in one shape.
 *
 * Five clinical screens each worked this out differently: the chart always drew
 * a red band even when nothing was flagged, the patient record hid the band
 * entirely when nothing was flagged, the case paper put it in a "Read first"
 * card, the prescription passed a summary into the form, and the treatment plan
 * did not load the data at all — so a plan could be agreed with no allergy
 * information anywhere on screen.
 *
 * The brief is explicit that a stored medical history nobody sees before
 * treating is worse than none, because it manufactures confidence. So this
 * deliberately distinguishes three states rather than two:
 *
 *   - alerts on file      → say them
 *   - checked, none found → say *that*, plainly, so the absence is a fact
 *   - nothing recorded    → say nobody has asked yet
 *
 * The last two still look identical in the data: `medicalNotes` and
 * `drugAllergies` are free text with no "last confirmed" date, so an empty
 * field cannot tell "no allergies" from "never asked", and this reports the
 * honest, weaker claim.
 *
 * **Where the allergies come from.** They used to be read off clinical notes.
 * Notes were removed from the product, and an allergy is not a note — it is a
 * standing fact about the person — so the source moved rather than going with
 * them: what the patient reported on their intake form
 * (`PatientIntakeRequest.drugAllergies`) and what the clinic has written on the
 * patient record (`Patient.medicalNotes`). An intake the clinic has not yet
 * reviewed still counts, and the banner says so rather than presenting it with
 * the same authority as something a clinician wrote down.
 */

export type SafetyIntakeAnswer = {
  drugAllergies?: string | null;
  /** `REVIEWED` once somebody at the clinic has been through it. */
  status?: string | null;
};

export type SafetySource = {
  medicalNotes?: string | null;
  /** Newest first. Every intake that recorded an allergy counts. */
  intakeAnswers?: ReadonlyArray<SafetyIntakeAnswer> | null;
};

export type PatientSafety = {
  allergies: string | null;
  notes: string | null;
  /** Everything worth reading, already ordered — allergies lead. */
  lines: string[];
  hasAlerts: boolean;
  /**
   * True when the allergies shown came only from an intake form the clinic has
   * not reviewed yet. False when the clinic has confirmed one, and false when
   * there is nothing to show.
   */
  allergiesUnreviewed: boolean;
};

const isUnreviewed = (answer: SafetyIntakeAnswer) => answer.status !== "REVIEWED";

export function patientSafety(source: SafetySource | null | undefined): PatientSafety {
  const withAllergies = source?.intakeAnswers?.filter((answer) => answer.drugAllergies?.trim()) ?? [];
  const reported = withAllergies[0]?.drugAllergies?.trim() || null;
  const notes = source?.medicalNotes?.trim() || null;

  const lines = [reported ? `Allergies: ${reported}` : null, notes].filter(
    (line): line is string => Boolean(line),
  );

  return {
    allergies: reported,
    notes,
    lines,
    hasAlerts: lines.length > 0,
    // Only when every intake carrying an allergy is still unreviewed. One
    // reviewed intake means somebody at the clinic has been through it.
    allergiesUnreviewed: Boolean(reported) && withAllergies.every(isUnreviewed),
  };
}
