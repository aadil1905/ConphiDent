import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";

const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().transform((value) => value.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10)),
  email: z.union([z.literal(""), z.string().email()]).optional().default(""),
  dateOfBirth: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().default(""),
  gender: z.union([z.literal(""), z.enum(["Female", "Male", "Non-binary", "Prefer not to say"])]).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
});

const finalizeSchema = z.object({
  id: z.coerce.number().int().positive(),
  treatmentDone: z.string().trim().max(3000).optional().default(""),
  estimateAmount: z.union([z.literal(""), z.coerce.number().int().nonnegative()]).optional().default(""),
});

function patientLink(request: NextRequest, token: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return `${configured || request.nextUrl.origin}/intake/${token}`;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  try {
    const input = patientSchema.parse(await request.json());
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const patient = await prisma.patient.upsert({
      where: { clinicId_phone: { clinicId: user.clinicId, phone: input.phone } },
      create: {
        clinicId: user.clinicId,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender || null,
        address: input.address || null,
      },
      update: {
        fullName: input.fullName,
        email: input.email || undefined,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
        gender: input.gender || undefined,
        address: input.address || undefined,
      },
    });
    const completedIntake = await prisma.patientIntakeRequest.findFirst({
      where: { clinicId: user.clinicId, patientId: patient.id, status: { in: ["COMPLETED", "REVIEWED"] } },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    });
    if (completedIntake) {
      return NextResponse.json({
        error: "This existing patient has already completed intake. Update the patient profile only when their information has changed.",
        patientId: patient.id,
        intakeComplete: true,
      }, { status: 409 });
    }

    const intake = await prisma.patientIntakeRequest.create({
      data: { clinicId: user.clinicId, patientId: patient.id, token, expiresAt },
    });
    const link = patientLink(request, token);
    let warning = "";

    try {
      const whatsappTo = `91${input.phone}`;
      if (process.env.WHATSAPP_INTAKE_TEMPLATE) {
        await sendTemplateMessage(
          whatsappTo,
          process.env.WHATSAPP_INTAKE_TEMPLATE,
          process.env.WHATSAPP_INTAKE_TEMPLATE_LANG || "en",
          [input.fullName, link],
          user.clinicId,
        );
      } else {
        await sendTextMessage(
          whatsappTo,
          `Hello ${input.fullName}, ${user.clinic.brandName || user.clinic.name} has sent your secure patient-intake form. Please complete your medical history, consent, and signature within 48 hours:\n\n${link}`,
          user.clinicId,
        );
      }
      await prisma.patientIntakeRequest.update({
        where: { id: intake.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    } catch (error) {
      warning = error instanceof Error ? error.message : "WhatsApp could not send the link.";
    }

    return NextResponse.json({
      id: intake.id,
      patientId: patient.id,
      link,
      status: warning ? "CREATED" : "SENT",
      expiresAt,
      warning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Please check the patient details." }, { status: 400 });
    }
    console.error("Create patient intake failed", error);
    return NextResponse.json({ error: "The intake request could not be created." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid intake request." }, { status: 400 });

  const intake = await prisma.patientIntakeRequest.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: { select: { id: true, fullName: true, phone: true } } },
  });
  if (!intake) return NextResponse.json({ error: "Intake request not found." }, { status: 404 });
  return NextResponse.json({
    id: intake.id,
    status: intake.expiresAt <= new Date() && !["COMPLETED", "REVIEWED"].includes(intake.status) ? "EXPIRED" : intake.status,
    patient: intake.patient,
    sentAt: intake.sentAt,
    openedAt: intake.openedAt,
    completedAt: intake.completedAt,
    expiresAt: intake.expiresAt,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  try {
    const input = finalizeSchema.parse(await request.json());
    const intake = await prisma.patientIntakeRequest.findFirst({
      where: { id: input.id, clinicId: user.clinicId },
      include: { patient: true },
    });
    if (!intake) return NextResponse.json({ error: "Intake request not found." }, { status: 404 });
    if (intake.status !== "COMPLETED") {
      return NextResponse.json({ error: "The patient must complete the WhatsApp form first." }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.clinicalRecord.updateMany({
        where: { patientId: intake.patientId, chiefComplaint: "Initial patient intake" },
        data: {
          treatmentDone: input.treatmentDone || null,
          estimateAmount: input.estimateAmount === "" ? null : input.estimateAmount,
          clinicalNotes: "Secure WhatsApp patient-intake form reviewed by clinic staff.",
        },
      }),
      prisma.patientIntakeRequest.update({
        where: { id: intake.id },
        data: {
          status: "REVIEWED",
          reviewedAt: new Date(),
          reviewedBy: user.fullName,
          treatmentDone: input.treatmentDone || null,
          estimateAmount: input.estimateAmount === "" ? null : input.estimateAmount,
        },
      }),
    ]);

    return NextResponse.json({ patientId: intake.patientId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Please check the estimate." }, { status: 400 });
    }
    console.error("Finalize intake failed", error);
    return NextResponse.json({ error: "The intake could not be finalized." }, { status: 500 });
  }
}
