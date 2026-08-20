export type StructuredMedication = {
  genericName: string;
  brandName?: string;
  formulation?: string;
  strength: string;
  dosageForm: string;
  dose: string;
  doseUnit: string;
  route: string;
  frequency: string;
  timing?: string;
  mealRelation?: string;
  startDate?: string;
  duration: string;
  endDate?: string;
  quantity?: string;
  asNeeded?: boolean;
  maxDose?: string;
  indication?: string;
  instructions?: string;
  substitutionAllowed?: boolean;
};

export function patientAge(dateOfBirth: Date | null, at = new Date()) {
  if (!dateOfBirth) return null;
  let years = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayPending = at.getUTCMonth() < dateOfBirth.getUTCMonth() || (at.getUTCMonth() === dateOfBirth.getUTCMonth() && at.getUTCDate() < dateOfBirth.getUTCDate());
  if (birthdayPending) years -= 1;
  return Math.max(0, years);
}

/** Renders both canonical numeric snapshots and legacy values such as "34 years". */
export function formatPatientAgeSnapshot(value?: string | null) {
  const age = value?.trim();
  if (!age) return null;
  return /\byears?\b/i.test(age) ? age : `${age} years`;
}

/**
 * An allergy is a standing fact about the patient, not a property of any one
 * document. It used to be gathered from clinical notes; notes were removed from
 * the product and the allergy did not go with them — it is now gathered from
 * every intake the patient has filled in, plus the clinic's own note on the
 * patient record. Any one of them may have been left blank, so they are all
 * read and de-duplicated rather than taking the most recent.
 */
export function allergySummaryFrom(
  reported: readonly { drugAllergies?: string | null }[],
  medicalNotes?: string | null,
) {
  const parts = [...reported.map((entry) => entry.drugAllergies), medicalNotes]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length ? [...new Set(parts)].join(" · ") : null;
}

export function medicationSummary(items: StructuredMedication[]) {
  return items.map((item) => [
    `${item.genericName}${item.brandName ? ` (${item.brandName})` : ""} ${item.strength} ${item.dosageForm}`,
    `${item.dose} ${item.doseUnit} · ${item.route} · ${item.frequency}`,
    item.mealRelation,
    item.duration,
    item.asNeeded ? `PRN${item.maxDose ? ` · max ${item.maxDose}` : ""}` : null,
  ].filter(Boolean).join(" — ")).join("\n");
}

function normalizedWords(value: string) {
  return new Set(value.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 4));
}

function normalizedText(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

type DrugFamily = {
  key: string;
  /** How the family reads in a warning. */
  label: string;
  /** What an allergy tends to be written down as. */
  aliases: readonly string[];
  /** Molecules in the family, including Indian spelling variants. */
  members: readonly string[];
  /** Name fragments that reliably indicate membership. */
  stems?: readonly string[];
  /** Families close enough in structure to be worth flagging. */
  crossReacts?: readonly string[];
};

/**
 * An allergy is almost never written down as the molecule you are about to
 * prescribe — the file says "penicillin" and the script says amoxicillin. A
 * plain word match misses exactly that case, so family membership is checked
 * too. Everything here is dentistry-relevant and deliberately conservative:
 * over-warning costs a click, under-warning costs a patient.
 */
const DRUG_FAMILIES: readonly DrugFamily[] = [
  {
    key: "penicillin",
    label: "a penicillin",
    aliases: ["penicillin", "penicillins", "pcn", "augmentin", "amoxiclav", "amoxyclav", "co-amoxiclav", "coamoxiclav"],
    members: ["penicillin", "benzylpenicillin", "phenoxymethylpenicillin", "amoxicillin", "amoxycillin", "ampicillin", "cloxacillin", "dicloxacillin", "flucloxacillin", "piperacillin", "clavulanate", "clavulanic", "amoxiclav", "augmentin"],
    stems: ["cillin"],
    crossReacts: ["cephalosporin"],
  },
  {
    key: "cephalosporin",
    label: "a cephalosporin",
    aliases: ["cephalosporin", "cephalosporins"],
    members: ["cephalexin", "cefalexin", "cephalothin", "cefadroxil", "cefuroxime", "cefixime", "cefpodoxime", "ceftriaxone", "cefotaxime", "cefaclor", "cefdinir"],
    crossReacts: ["penicillin"],
  },
  {
    key: "nsaid",
    label: "an anti-inflammatory painkiller",
    aliases: ["nsaid", "nsaids", "anti-inflammatory", "antiinflammatory"],
    members: ["ibuprofen", "diclofenac", "aceclofenac", "naproxen", "ketorolac", "ketoprofen", "mefenamic", "nimesulide", "etoricoxib", "indomethacin", "piroxicam", "aspirin", "acetylsalicylic"],
  },
  {
    key: "sulfonamide",
    label: "a sulfa medicine",
    aliases: ["sulfa", "sulpha", "sulfonamide", "sulphonamide"],
    members: ["sulfamethoxazole", "cotrimoxazole", "co-trimoxazole", "sulfadiazine", "sulfasalazine"],
    stems: ["sulfa", "sulpha"],
  },
  {
    key: "macrolide",
    label: "a macrolide antibiotic",
    aliases: ["macrolide", "macrolides"],
    members: ["erythromycin", "azithromycin", "clarithromycin", "roxithromycin"],
    stems: ["thromycin"],
  },
  {
    key: "tetracycline",
    label: "a tetracycline",
    aliases: ["tetracycline", "tetracyclines"],
    members: ["tetracycline", "doxycycline", "minocycline"],
    stems: ["cycline"],
  },
  {
    key: "quinolone",
    label: "a quinolone antibiotic",
    aliases: ["quinolone", "quinolones", "fluoroquinolone"],
    members: ["ciprofloxacin", "levofloxacin", "ofloxacin", "moxifloxacin", "norfloxacin"],
    stems: ["floxacin"],
  },
  {
    key: "nitroimidazole",
    label: "a nitroimidazole",
    aliases: ["metronidazole", "flagyl", "nitroimidazole"],
    members: ["metronidazole", "tinidazole", "ornidazole", "secnidazole"],
    stems: ["nidazole"],
  },
  {
    key: "local-anaesthetic",
    label: "a local anaesthetic",
    aliases: ["local anaesthetic", "local anesthetic", "anaesthetic", "anesthetic", "xylocaine"],
    members: ["lignocaine", "lidocaine", "articaine", "mepivacaine", "bupivacaine", "prilocaine", "ropivacaine", "benzocaine", "procaine", "tetracaine"],
    stems: ["caine"],
  },
  {
    key: "opioid",
    label: "an opioid",
    aliases: ["opioid", "opioids", "opiate", "opiates"],
    members: ["codeine", "tramadol", "morphine", "fentanyl", "oxycodone", "pethidine"],
  },
  {
    key: "paracetamol",
    label: "paracetamol",
    aliases: ["paracetamol", "acetaminophen"],
    members: ["paracetamol", "acetaminophen"],
  },
];

function familyMatches(text: string, family: DrugFamily, includeAliases: boolean) {
  const needles = includeAliases
    ? [...family.aliases, ...family.members, ...(family.stems ?? [])]
    : [...family.members, ...(family.stems ?? [])];
  return needles.some((needle) => text.includes(needle));
}

export function prescriptionWarnings(input: { items: StructuredMedication[]; allergies?: string | null; age?: number | null }) {
  const warnings: string[] = [];
  const duplicates = new Map<string, number>();
  for (const item of input.items) {
    const key = `${item.genericName.trim().toLowerCase()}|${item.strength.trim().toLowerCase()}`;
    duplicates.set(key, (duplicates.get(key) || 0) + 1);
  }
  for (const [key, count] of duplicates) if (count > 1) warnings.push(`Possible duplicate medicine: ${key.split("|")[0]} ${key.split("|")[1]}.`);
  const allergyText = normalizedText(input.allergies || "");
  const allergyWords = normalizedWords(input.allergies || "");
  // Families the patient is recorded as reacting to, however it was written down.
  const allergicTo = allergyText.trim()
    ? DRUG_FAMILIES.filter((family) => familyMatches(allergyText, family, true))
    : [];

  for (const item of input.items) {
    const label = `${item.genericName} ${item.brandName || ""} ${item.formulation || ""}`;
    const medicineText = normalizedText(label);
    const medicineWords = normalizedWords(label);

    // The name itself appears in the allergy note.
    if ([...medicineWords].some((word) => allergyWords.has(word))) {
      warnings.push(`Allergy conflict requires review: ${item.genericName}.`);
      continue;
    }

    // The medicine belongs to a family the patient reacts to.
    const direct = allergicTo.find((family) => familyMatches(medicineText, family, false));
    if (direct) {
      warnings.push(
        `Allergy conflict requires review: ${item.genericName} is ${direct.label}, and the file records an allergy to ${direct.label}.`,
      );
      continue;
    }

    // Close enough in structure to be worth naming, e.g. penicillin and cephalosporins.
    const cross = allergicTo.find((family) =>
      (family.crossReacts ?? []).some((key) => {
        const other = DRUG_FAMILIES.find((candidate) => candidate.key === key);
        return other ? familyMatches(medicineText, other, false) : false;
      }),
    );
    if (cross) {
      warnings.push(
        `Possible cross-reaction requires review: ${item.genericName} may cross-react with ${cross.label}, which the file records as an allergy.`,
      );
    }
  }
  if (typeof input.age === "number" && input.age < 12) warnings.push("Paediatric patient: verify age/weight-appropriate dose and formulation.");
  if (typeof input.age === "number" && input.age >= 65) warnings.push("Older adult: review dose, renal/hepatic risk, interactions, and fall/sedation risk.");
  if (input.items.some((item) => item.asNeeded && !item.maxDose)) warnings.push("PRN medicine requires a maximum dose or limit.");
  return [...new Set(warnings)];
}
