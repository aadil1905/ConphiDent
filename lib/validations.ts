import { z } from "zod";
import { parseAppointmentTime, parseClinicDate } from "@/lib/scheduling-core";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const appointmentDate = isoDate.refine((value) => {
  try { parseClinicDate(value); return true; } catch { return false; }
}, "Enter a real calendar date");
const appointmentTime = z.string().refine((value) => {
  try { parseAppointmentTime(value); return true; } catch { return false; }
}, "Enter time in 24-hour HH:mm format");

export const appointmentSchema = z.object({
  patientName: z
    .string()
    .trim()
    .min(2, "Patient name must be at least 2 characters")
    .max(160, "Patient name is too long"),

  phone: z
    .string()
    .trim()
    .refine((value) => /^\+?[0-9 ()-]{8,24}$/.test(value) && value.replace(/\D/g, "").length >= 8, "Enter a valid phone number"),

  appointmentDate,

  appointmentTime,

  treatment: z.string().trim().min(2, "Reason for visit is required").max(120),

  status: z.enum([
    "Pending",
    "Confirmed",
    "Completed",
    "Cancelled",
    "No-show",
  ]),

  notes: z.string().max(5000, "Notes are too long").optional(),
  locationId: z.number().int().positive().nullable().optional(),
  providerId: z.number().int().positive().nullable().optional(),
  chairId: z.number().int().positive().nullable().optional(),
});

export type AppointmentFormValues = z.infer<
  typeof appointmentSchema
>;

export const patientSchema = z.object({
  fullName: z.string().trim().min(2, "Patient name must be at least 2 characters"),
  phone: z.string().trim().min(10, "Phone number must be at least 10 digits"),
  email: z.union([z.literal(""), z.string().email("Enter a valid email")]).optional(),
  dateOfBirth: z.union([z.literal(""), isoDate]).optional(),
  gender: z.union([z.literal(""), z.enum(["Female", "Male", "Non-binary", "Prefer not to say"])]).optional(),
  address: z.string().max(500, "Address is too long").optional(),
  medicalNotes: z.string().max(2000, "Medical notes are too long").optional(),
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export const clinicalRecordSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  visitDate: isoDate,
  chiefComplaint: z.string().trim().min(2, "Chief complaint is required").max(1000),
  diagnosis: z.string().max(1000).optional(),
  clinicalNotes: z.string().max(5000).optional(),
  medicalHistory: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  drugAllergies: z.string().max(1000).optional(),
  medications: z.string().max(1000).optional(),
  otherHistory: z.string().max(1000).optional(),
  bloodPressure: z.string().max(40).optional(),
  weightKg: z.string().max(40).optional(),
  dentalHistory: z.string().max(3000).optional(),
  treatmentDone: z.string().max(3000).optional(),
  estimateAmount: z.union([z.literal(""), z.coerce.number().int().nonnegative()]).optional(),
  consentGiven: z.boolean().optional(),
  consentNotes: z.string().max(2000).optional(),
});

export const treatmentPlanSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  visitDate: isoDate.optional(),
  title: z.string().trim().min(2, "Plan title is required").max(200),
  status: z.enum(["Proposed", "Accepted", "In Progress", "Completed", "Cancelled"]),
  estimatedCost: z.union([z.literal(""), z.coerce.number().int().nonnegative()]).optional(),
  serviceId: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  toothNumber: z.string().trim().max(4).optional(),
  toothNumbers: z.array(z.string().trim().min(1).max(4)).max(32).optional(),
  unitPrice: z.union([z.literal(""), z.coerce.number().int().nonnegative()]).optional(),
  notes: z.string().max(5000).optional(),
  items: z.array(z.object({ serviceId: z.number().int().positive().nullable().optional(), name: z.string().trim().min(1).max(200), price: z.coerce.number().int().nonnegative() })).min(1, "Add at least one treatment service"),
});

export const prescriptionSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  prescribedOn: isoDate,
  diagnosis: z.string().trim().max(1000).optional(),
  instructions: z.string().trim().max(3000).optional(),
  medicines: z.string().trim().max(5000).optional().default(""),
  issuePlace: z.string().trim().max(200).optional(),
  allergyAcknowledged: z.coerce.boolean().optional().default(false),
  medicationItems: z.array(z.object({
    genericName: z.string().trim().min(2).max(160),
    brandName: z.string().trim().max(160).optional(),
    formulation: z.string().trim().max(160).optional(),
    strength: z.string().trim().min(1).max(80),
    dosageForm: z.string().trim().min(1).max(80),
    dose: z.string().trim().min(1).max(80),
    doseUnit: z.string().trim().min(1).max(40),
    route: z.string().trim().min(1).max(80),
    frequency: z.string().trim().min(1).max(100),
    timing: z.string().trim().max(100).optional(),
    mealRelation: z.string().trim().max(100).optional(),
    startDate: z.string().trim().max(10).optional(),
    duration: z.string().trim().min(1).max(100),
    endDate: z.string().trim().max(10).optional(),
    quantity: z.string().trim().max(80).optional(),
    asNeeded: z.boolean().optional().default(false),
    maxDose: z.string().trim().max(100).optional(),
    indication: z.string().trim().max(300).optional(),
    instructions: z.string().trim().max(500).optional(),
    substitutionAllowed: z.boolean().optional().default(true),
  })).min(1, "Add at least one medicine").max(20),
});

export const invoiceSchema = z.object({
  // The API allocates the final number transactionally. Retain this optional
  // field only for compatibility with older clients that submitted a preview.
  invoiceNumber: z.string().trim().max(40).optional(),
  documentType: z.enum(["ESTIMATE", "QUOTATION", "TAX_INVOICE", "NON_TAX_INVOICE"]).default("TAX_INVOICE"),
  patientId: z.coerce.number().int().positive(),
  treatmentPlanId: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  issueDate: isoDate,
  dueDate: z.union([z.literal(""), isoDate]).optional(),
  totalAmount: z.coerce.number().int().positive("Invoice amount must be greater than zero"),
  discountAmount: z.coerce.number().int().nonnegative().optional().default(0),
  terms: z.string().trim().max(2000).optional(),
  lineItems: z.array(z.object({ description: z.string().trim().min(2).max(300), quantity: z.coerce.number().int().positive().max(10000), unitPrice: z.coerce.number().int().nonnegative(), discount: z.coerce.number().int().nonnegative().optional().default(0), taxPercent: z.coerce.number().int().min(0).max(100).optional().default(0) })).min(1).max(50),
  notes: z.string().max(2000).optional(),
  amountPaidToday: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
  paymentMethod: z.enum(["Cash", "UPI", "Card", "Bank transfer", "Other"]).optional(),
  paymentNotes: z.string().max(1000).optional(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().int().positive("Payment amount must be greater than zero"),
  method: z.enum(["Cash", "UPI", "Card", "Bank transfer", "Other"]),
  paidAt: isoDate,
  notes: z.string().max(1000).optional(),
});
