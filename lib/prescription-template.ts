import { z } from "zod";

export const prescriptionTemplateItemSchema = z.object({
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
});

export const prescriptionTemplateSchema = z.object({
  name: z.string().trim().min(3).max(100),
  diagnosis: z.string().trim().max(1000).optional(),
  items: z.array(prescriptionTemplateItemSchema).min(1).max(20),
});

