/**
 * The clinic's medical history, asked once and printed once.
 *
 * There used to be two lists: fifteen conditions on the printed consent pad in
 * the clinic's own clinical wording, and a differently-worded twelve on the
 * patient link. A record filled through the link therefore could not be ticked
 * onto the printed grid without claiming answers to questions nobody was asked.
 *
 * One list now, with two labels per row: `clinical` is what prints on the pad
 * and what a dentist reads; `patient` is what someone filling the link is
 * actually asked. Records store `key`, never a label, so the wording of either
 * can change later without orphaning a single historical answer.
 *
 * Fifteen rows exactly. The printed sheet lays them out three columns by five
 * and is set to fill one A4 page — a sixteenth row costs a second sheet.
 * "Drug allergies" and "current medication" are deliberately NOT rows here:
 * both have their own free-text fields on both surfaces and print beneath the
 * grid, so a tick-box for them was duplication holding two of the fifteen slots.
 */
export type MedicalCondition = {
  key: string;
  /** Printed on the pad, in the clinic's wording. */
  clinical: string;
  /** Asked on the patient link, in plain English. */
  patient: string;
};

export const MEDICAL_CONDITIONS: MedicalCondition[] = [
  { key: "hiv", clinical: "HIV / AIDS", patient: "HIV or AIDS" },
  { key: "heart", clinical: "Heart Conditions", patient: "Heart problem" },
  { key: "rheumatic-fever", clinical: "Rheumatic Fever", patient: "Rheumatic fever" },
  { key: "hypertension", clinical: "Hypertension", patient: "High blood pressure" },
  { key: "diabetes", clinical: "Diabetes", patient: "Diabetes" },

  { key: "thyroid", clinical: "Thyroid Disorder", patient: "Thyroid problem" },
  { key: "asthma", clinical: "Asthma", patient: "Asthma" },
  { key: "hepatitis", clinical: "Hepatitis / Jaundice", patient: "Hepatitis or jaundice" },
  { key: "bleeding", clinical: "Abnormal Bleeding / Bruising", patient: "Bleeding or bruising problem" },
  { key: "kidney", clinical: "Kidney Disease", patient: "Kidney problem" },

  { key: "anemia", clinical: "Anemia", patient: "Anaemia (low blood)" },
  { key: "fits", clinical: "Fits / Faints", patient: "Fits or fainting" },
  { key: "tuberculosis", clinical: "Tuberculosis / Infection", patient: "Tuberculosis or other infection" },
  { key: "pregnancy", clinical: "Pregnancy / Breastfeeding", patient: "Pregnant or breastfeeding" },
  { key: "tobacco", clinical: "Smoking / Tobacco Use", patient: "Smoking or tobacco use" },
];

/** Every key currently asked — what a record filled from today onwards covers. */
export const CURRENT_CONDITION_KEYS = MEDICAL_CONDITIONS.map((condition) => condition.key);

/** The printed grid: three columns of five, numbered 1–15 down the columns. */
export const CONDITION_COLUMNS: MedicalCondition[][] = [
  MEDICAL_CONDITIONS.slice(0, 5),
  MEDICAL_CONDITIONS.slice(5, 10),
  MEDICAL_CONDITIONS.slice(10, 15),
];

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Every wording a stored answer has ever used.
 *
 * Three vocabularies are in the database, not two: the current keys, the
 * twelve-question link wording, and an older clinical-style set from before
 * that form was reworded ("Heart conditions", "Fits/faints",
 * "Abnormal bleeding/bruising"). Matching is done on a stripped form so
 * punctuation and casing drift cannot break a match.
 *
 * "Drug Allergies" and "Medications" are absent on purpose — a legacy tick of
 * either resolves to nothing and is carried through to the sheet's free-text
 * "Others" line rather than being silently dropped.
 */
const ALIASES: Record<string, string[]> = {
  hiv: ["aids", "hiv", "hivaids", "aidshiv", "hivoraids"],
  heart: ["heartconditions", "heartcondition", "heartproblem", "heartproblems"],
  "rheumatic-fever": ["rheumaticfever"],
  hypertension: ["hypertension", "highbloodpressure", "highbp", "bp"],
  diabetes: ["diabetes", "diabetic"],
  thyroid: ["thyroid", "thyroidproblem", "thyroiddisorder"],
  asthma: ["asthma"],
  hepatitis: ["hepatitis", "hepatitisorjaundice", "hepatitisjaundice", "jaundice"],
  bleeding: ["abnormalbleedingbruising", "abnormalbleeding", "bleedingdisorder", "bleedingorbruisingproblem", "bruising"],
  kidney: ["kidneydisease", "kidneyproblem", "kidneyproblems", "kidney"],
  anemia: ["anemia", "anaemia", "anaemialowblood", "anemialowblood"],
  fits: ["fitsfaints", "fits", "faints", "epilepsy", "fitsorfainting"],
  tuberculosis: ["tuberculosis", "tb", "infectiousdiseases", "infectiousdisease", "tuberculosisinfection", "tuberculosisorotherinfection"],
  pregnancy: ["pregnancy", "pregnant", "pregnantorbreastfeeding", "pregnancybreastfeeding"],
  tobacco: ["smokingortobaccouse", "smokingtobaccouse", "smoking", "tobacco", "tobaccouse"],
};

const BY_ALIAS = new Map<string, string>();
for (const [key, aliases] of Object.entries(ALIASES)) {
  BY_ALIAS.set(normalise(key), key);
  for (const alias of aliases) BY_ALIAS.set(alias, key);
}

/** A stored answer resolved to a condition key, or null if it is not one of ours. */
export function resolveConditionKey(stored: string) {
  return BY_ALIAS.get(normalise(stored)) ?? null;
}

const BY_KEY = new Map(MEDICAL_CONDITIONS.map((condition) => [condition.key, condition]));

/**
 * The clinical label for a stored answer, for screens that show the history
 * back to staff. Null when the answer matches no row, so the caller can decide
 * whether to show the raw string or drop it.
 */
export function conditionLabel(stored: string) {
  const key = resolveConditionKey(stored);
  return key ? BY_KEY.get(key)?.clinical ?? null : null;
}

export type ResolvedHistory = {
  /** Conditions the patient said yes to. */
  ticked: Set<string>;
  /** Stored answers that match no row — legacy ticks, printed under "Others". */
  unmatched: string[];
};

export function resolveHistory(stored: string[]): ResolvedHistory {
  const ticked = new Set<string>();
  const unmatched: string[] = [];
  for (const entry of stored) {
    const key = resolveConditionKey(entry);
    if (key) ticked.add(key);
    else if (entry.trim()) unmatched.push(entry.trim());
  }
  return { ticked, unmatched };
}

/**
 * Which rows this record can honestly be ticked against.
 *
 * `asked` is the list of keys the patient was actually shown, recorded on the
 * intake row from the day this list shipped. Records taken before that have no
 * such list, and there is no way to recover it — an empty answer set does not
 * say whether twelve questions or fifteen were on screen. Those return null,
 * and the sheet falls back to listing what was recorded instead of ticking a
 * grid it cannot vouch for.
 */
export function parseAskedKeys(stored: string | null | undefined): string[] | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    const keys = parsed.filter((entry): entry is string => typeof entry === "string" && BY_ALIAS.has(normalise(entry))).map((entry) => BY_ALIAS.get(normalise(entry))!);
    return keys.length ? keys : null;
  } catch {
    return null;
  }
}
