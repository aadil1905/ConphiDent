/**
 * ISO 3950 / WHO-FDI two-digit tooth notation.
 *
 * The first digit is the quadrant and the second is the tooth position from
 * the midline. Permanent quadrants are 1-4 (positions 1-8); primary
 * quadrants are 5-8 (positions 1-5). Age only suggests a dentition stage.
 * The clinician remains responsible for confirming what is actually present.
 */

export const DENTITION_STAGES = ["PRIMARY", "MIXED", "PERMANENT", "NOT_ASSESSED"] as const;
export type DentitionStage = (typeof DENTITION_STAGES)[number];

export const PERMANENT_UPPER = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
] as const;

export const PERMANENT_LOWER = [
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
] as const;

export const PRIMARY_UPPER = [
  "55", "54", "53", "52", "51", "61", "62", "63", "64", "65",
] as const;

export const PRIMARY_LOWER = [
  "85", "84", "83", "82", "81", "71", "72", "73", "74", "75",
] as const;

export const PERMANENT_FDI_CODES = [...PERMANENT_UPPER, ...PERMANENT_LOWER] as const;
export const PRIMARY_FDI_CODES = [...PRIMARY_UPPER, ...PRIMARY_LOWER] as const;
export const STANDARD_FDI_CODES = [...PERMANENT_FDI_CODES, ...PRIMARY_FDI_CODES] as const;

const permanentSet = new Set<string>(PERMANENT_FDI_CODES);
const primarySet = new Set<string>(PRIMARY_FDI_CODES);
const standardSet = new Set<string>(STANDARD_FDI_CODES);

export const DENTITION_STAGE_LABELS: Record<DentitionStage, string> = {
  PRIMARY: "Primary dentition",
  MIXED: "Mixed dentition",
  PERMANENT: "Permanent dentition",
  NOT_ASSESSED: "Not assessed",
};

export function isStandardFdiCode(value: string): boolean {
  return standardSet.has(value);
}

export function dentitionForFdiCode(value: string): "PRIMARY" | "PERMANENT" | null {
  if (primarySet.has(value)) return "PRIMARY";
  if (permanentSet.has(value)) return "PERMANENT";
  return null;
}

export function isFdiAllowedForStage(value: string, stage: DentitionStage): boolean {
  if (!isStandardFdiCode(value)) return false;
  if (stage === "PRIMARY") return primarySet.has(value);
  if (stage === "PERMANENT") return permanentSet.has(value);
  return stage === "MIXED";
}

export function toothRowsForStage(stage: DentitionStage) {
  if (stage === "PRIMARY") {
    return [
      { id: "primary-upper", title: "Primary upper jaw", teeth: [...PRIMARY_UPPER] },
      { id: "primary-lower", title: "Primary lower jaw", teeth: [...PRIMARY_LOWER] },
    ];
  }
  if (stage === "PERMANENT") {
    return [
      { id: "permanent-upper", title: "Permanent upper jaw", teeth: [...PERMANENT_UPPER] },
      { id: "permanent-lower", title: "Permanent lower jaw", teeth: [...PERMANENT_LOWER] },
    ];
  }
  if (stage === "MIXED") {
    return [
      { id: "permanent-upper", title: "Permanent upper jaw", teeth: [...PERMANENT_UPPER] },
      { id: "primary-upper", title: "Primary upper jaw", teeth: [...PRIMARY_UPPER] },
      { id: "primary-lower", title: "Primary lower jaw", teeth: [...PRIMARY_LOWER] },
      { id: "permanent-lower", title: "Permanent lower jaw", teeth: [...PERMANENT_LOWER] },
    ];
  }
  return [];
}

export function calculateAgeMonths(dateOfBirth: Date | string, referenceDate: Date | string = new Date()): number | null {
  const birth = new Date(dateOfBirth);
  const reference = new Date(referenceDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime()) || birth > reference) return null;

  let months = (reference.getUTCFullYear() - birth.getUTCFullYear()) * 12;
  months += reference.getUTCMonth() - birth.getUTCMonth();
  if (reference.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** AAPD describes mixed dentition as approximately ages 6-13. */
export function suggestDentitionStage(
  dateOfBirth: Date | string | null | undefined,
  referenceDate: Date | string = new Date(),
): Exclude<DentitionStage, "NOT_ASSESSED"> | null {
  if (!dateOfBirth) return null;
  const ageMonths = calculateAgeMonths(dateOfBirth, referenceDate);
  if (ageMonths === null) return null;
  if (ageMonths < 72) return "PRIMARY";
  if (ageMonths < 156) return "MIXED";
  return "PERMANENT";
}

export function formatAge(dateOfBirth: Date | string | null | undefined, referenceDate: Date | string = new Date()) {
  if (!dateOfBirth) return "Date of birth not recorded";
  const ageMonths = calculateAgeMonths(dateOfBirth, referenceDate);
  if (ageMonths === null) return "Date of birth is invalid";
  if (ageMonths < 24) return `${ageMonths} month${ageMonths === 1 ? "" : "s"}`;
  const years = Math.floor(ageMonths / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

export function pronounceFdiCode(value: string) {
  return value.length === 2 ? `${value[0]} ${value[1]}` : value;
}
