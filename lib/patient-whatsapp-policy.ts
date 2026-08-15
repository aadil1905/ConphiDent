export const PATIENT_WHATSAPP_PURPOSES = [
  "CARE_COMMUNICATION",
  "PATIENT_INTAKE",
  "APPOINTMENT_COMMUNICATION",
  "CLINICAL_FOLLOW_UP",
  "BILLING_COMMUNICATION",
  "LABORATORY_COMMUNICATION",
] as const;

export type PatientWhatsAppPurpose = (typeof PATIENT_WHATSAPP_PURPOSES)[number];

export function isPatientWhatsAppPurpose(value: string): value is PatientWhatsAppPurpose {
  return PATIENT_WHATSAPP_PURPOSES.includes(value as PatientWhatsAppPurpose);
}

/**
 * A patient-level CARE_COMMUNICATION grant covers narrower operational care
 * messages. A later purpose-specific or general withdrawal still wins because
 * callers always select the newest event across this list.
 */
export function acceptedConsentPurposes(purpose: PatientWhatsAppPurpose) {
  return purpose === "CARE_COMMUNICATION"
    ? [purpose]
    : [purpose, "CARE_COMMUNICATION"];
}

export function patientWhatsAppCanQueue(input: {
  patientExists: boolean;
  phoneMatches: boolean;
  conversationOptedOut: boolean;
  latestConsentStatus?: string | null;
  consentConfirmed: boolean;
}) {
  if (!input.patientExists || !input.phoneMatches || input.conversationOptedOut) return false;
  if (input.latestConsentStatus === "WITHDRAWN") return false;
  return input.latestConsentStatus === "GRANTED" || input.consentConfirmed;
}

export function patientWhatsAppIdempotencyKey(clinicId: number, requestKey: string) {
  const normalized = requestKey.trim().replace(/[^A-Za-z0-9:._-]/g, "-").slice(0, 180);
  if (!Number.isInteger(clinicId) || clinicId < 1 || normalized.length < 8) {
    throw new Error("A valid clinic and idempotency key are required.");
  }
  return `patient-whatsapp:${clinicId}:${normalized}`;
}

export function followUpWhatsAppPurpose(taskType: string): PatientWhatsAppPurpose {
  if (taskType === "PAYMENT_FOLLOW_UP") return "BILLING_COMMUNICATION";
  if (taskType === "LABORATORY_FOLLOW_UP") return "LABORATORY_COMMUNICATION";
  if (["TREATMENT_FOLLOW_UP"].includes(taskType)) return "CLINICAL_FOLLOW_UP";
  return "APPOINTMENT_COMMUNICATION";
}

export function patientSafeFollowUpMessage(taskType: string, patientName: string, clinicName: string) {
  const greeting = `Hello ${patientName}, ${clinicName}`;
  if (taskType === "PAYMENT_FOLLOW_UP") return `${greeting} has an account follow-up for you. Reply here or contact the clinic when convenient. No financial details are included in this message.`;
  if (taskType === "LABORATORY_FOLLOW_UP") return `${greeting} has a care-coordination update for you. Please reply here before making any change to an appointment.`;
  if (taskType === "TREATMENT_FOLLOW_UP") return `${greeting} is checking in after your recent care discussion. Reply here if you would like the clinical team to contact you.`;
  return `${greeting} is following up about appointment scheduling. Reply here if you would like help choosing a convenient time.`;
}
