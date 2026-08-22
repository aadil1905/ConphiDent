import { reportError } from "@/lib/monitoring";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const formSchema = z.object({
  medicalHistory: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  medicalHistoryAsked: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  drugAllergies: z.string().trim().max(1000).optional().default(""),
  medications: z.string().trim().max(1000).optional().default(""),
  // A regex alone admits 2026-02-31, which becomes an Invalid Date and a 500.
  dateOfBirth: z
    .union([
      z.literal(""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return (
          parsed.getUTCFullYear() === year
          && parsed.getUTCMonth() === month - 1
          && parsed.getUTCDate() === day
          && parsed.getTime() <= Date.now()
        );
      }, "Enter a real date of birth."),
    ])
    .optional()
    .default(""),
  // Matches the vocabulary the clinic's own patient form offers, so intake
  // cannot introduce a value the rest of the app never shows.
  sex: z.enum(["", "Female", "Male", "Non-binary", "Prefer not to say"]).optional().default(""),
  otherHistory: z.string().trim().max(1000).optional().default(""),
  bloodPressure: z.string().trim().max(40).optional().default(""),
  weightKg: z.string().trim().max(40).optional().default(""),
  dentalHistory: z.string().trim().max(3000).optional().default(""),
  consentGiven: z.literal(true),
  consentNotes: z.string().trim().max(2000).optional().default(""),
  patientSignature: z.string().startsWith("data:image/svg+xml;base64,").max(500000),
  guardianSignature: z.union([z.literal(""), z.string().startsWith("data:image/svg+xml;base64,").max(500000)]).optional().default(""),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_100_000) return NextResponse.json({ error: "That is more than we can take at once. Try a shorter signature." }, { status: 413 });
    const input = formSchema.parse(await request.json());
    const intake = await prisma.patientIntakeRequest.findUnique({ where: { token } });
    if (!intake) return NextResponse.json({ error: "We could not find this link. Ask the clinic for a fresh one." }, { status: 404 });
    if (intake.expiresAt <= new Date()) return NextResponse.json({ error: "This link has run out. Reply to the clinic's message and they will send a new one." }, { status: 410 });
    if (["COMPLETED", "REVIEWED"].includes(intake.status)) {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    const completedAt = new Date();
    const submitted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.patientIntakeRequest.updateMany({
        where: {
          id: intake.id,
          // The id alone already pins the row; clinicId is here because the
          // tenant guard refuses an updateMany that cannot name a clinic —
          // same shape as the patient.updateMany calls below and the sign-in
          // writes in app/login/actions.ts.
          clinicId: intake.clinicId,
          expiresAt: { gt: completedAt },
          status: { notIn: ["COMPLETED", "REVIEWED"] },
        },
        data: {
        status: "COMPLETED",
        medicalHistory: JSON.stringify(input.medicalHistory),
        medicalHistoryAsked: input.medicalHistoryAsked?.length ? JSON.stringify(input.medicalHistoryAsked) : null,
        drugAllergies: input.drugAllergies || null,
        medications: input.medications || null,
        otherHistory: input.otherHistory || null,
        bloodPressure: input.bloodPressure || null,
        weightKg: input.weightKg || null,
        dentalHistory: input.dentalHistory || null,
        consentGiven: true,
        consentNotes: input.consentNotes || "Patient accepted the clinic consent statement.",
        patientSignature: input.patientSignature,
        guardianSignature: input.guardianSignature || null,
        completedAt,
        },
      });
      if (!claimed.count) return false;

      // The date of birth is data, not prose: the dental chart preselects the
      // dentition stage from it. Fill-if-empty only — what the front desk has
      // already recorded outranks what a patient types into a phone form.
      if (input.dateOfBirth) {
        await tx.patient.updateMany({
          where: { id: intake.patientId, clinicId: intake.clinicId, dateOfBirth: null },
          // Anchored at UTC noon like every other clinic date, so reading the
          // day back in UTC can never land on the day before.
          data: { dateOfBirth: new Date(`${input.dateOfBirth}T12:00:00.000Z`) },
        });
      }
      if (input.sex) {
        await tx.patient.updateMany({
          where: { id: intake.patientId, clinicId: intake.clinicId, gender: null },
          data: { gender: input.sex },
        });
      }

      return true;
    });
    if (!submitted) return NextResponse.json({ success: true, alreadyCompleted: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Something on the last page still needs filling in. Go back and check the highlighted boxes." }, { status: 400 });
    }
    await reportError(error, { where: "api/public-intake" });
    return NextResponse.json({ error: "That didn't save." }, { status: 500 });
  }
}
