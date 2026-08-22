import { reportError } from "@/lib/monitoring";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiFeature, requireApiPermission, requireApiUser } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { PatientWhatsAppPolicyError, queuePatientWhatsAppMessage } from "@/lib/patient-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";
import { INTAKE_LINK_DAYS } from "@/lib/patient-intake-link";

const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().transform((value) => value.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10)),
  email: z.union([z.literal(""), z.string().email()]).optional().default(""),
  dateOfBirth: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().default(""),
  gender: z.union([z.literal(""), z.enum(["Female", "Male", "Non-binary", "Prefer not to say"])]).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  consentConfirmed: z.literal(true),
  // "send" (default) queues the WhatsApp message, same as always. "fill-now"
  // is the desk path: the patient is right there, so nothing is sent — staff
  // are handed the same link to open on the desk device instead.
  mode: z.enum(["send", "fill-now"]).optional().default("send"),
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
  // Authenticate before touching the body: parsing/validating first meant an
  // unauthenticated caller with a bad payload got a schema 400 (or a 500 via
  // reportError, for malformed JSON) instead of a clean 401, and every such
  // request landed in error monitoring as if it were a real failure.
  const gateAuth = await requireApiUser();
  if (!gateAuth.user) return gateAuth.response;
  try {
    const body = await request.json();
    const input = patientSchema.parse(body);
    // Sending needs the WhatsApp feature and permission on, same as before.
    // Filling it in at the desk is just registering a patient and opening a
    // page — it must not be blocked on a clinic that hasn't set up WhatsApp.
    const gate =
      input.mode === "fill-now"
        ? await requireApiPermission("managePatients")
        : await requireApiFeature("whatsapp", "sendWhatsApp");
    const { user, response } = gate;
    if (!user) return response;
    const token = randomBytes(32).toString("hex");
    // Same lifetime as lib/patient-intake-link.ts's createAndSendIntakeLink —
    // "one place that mints an intake link, so a link never means two
    // different things" was the point of that helper, but this route grew
    // its own separate 48-hour token in parallel. Every surface around this
    // wizard (its own info box, this page's step copy, the public form)
    // promises the INTAKE_LINK_DAYS week, so the token needs to actually live
    // that long rather than the copy being fixed to admit two days.
    const expiresAt = new Date(Date.now() + INTAKE_LINK_DAYS * 24 * 60 * 60 * 1000);

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

    if (input.mode === "fill-now") {
      // Staff are about to open this link themselves — a WhatsApp message to
      // the patient's phone right now would be redundant at best, confusing
      // at worst (they're sitting at the desk, not reaching for their phone).
      await prisma.patientIntakeRequest.update({ where: { id: intake.id, clinicId: user.clinicId }, data: { status: "OPENED", openedAt: new Date() } });
    } else {
      try {
        const queued = await queuePatientWhatsAppMessage({
          clinicId: user.clinicId,
          patientId: patient.id,
          phone: patient.phone,
          content: `Hello ${input.fullName}, ${user.clinic.brandName || user.clinic.name} has sent your secure patient-intake form. Please complete your medical history, consent, and signature within ${INTAKE_LINK_DAYS} days:\n\n${link}`,
          purpose: "PATIENT_INTAKE",
          sourceType: "PATIENT_INTAKE",
          sourceId: String(intake.id),
          idempotencyKey: `patient-intake:${intake.id}`,
          actorUserId: user.id,
          actorRole: user.role,
          consentConfirmed: input.consentConfirmed,
          // Matches what the on-screen checkbox actually asks staff to
          // confirm now that one checkbox covers both "send" and "fill-now" —
          // it no longer specifically attests to a WhatsApp-number consent,
          // so the compliance record this becomes must not claim more than
          // that. The WhatsApp delivery itself is stated as fact, not as
          // something staff attested to.
          consentEvidence: "Staff confirmed the patient agreed to share their details for this intake record; the link was sent to this number on WhatsApp.",
          auditAction: "PATIENT_INTAKE_WHATSAPP_QUEUED",
          preferredTemplateName: process.env.WHATSAPP_INTAKE_TEMPLATE,
          preferredTemplateLanguage: process.env.WHATSAPP_INTAKE_TEMPLATE_LANG || "en",
          templateParameters: [input.fullName, link],
          redactContent: true,
        });
        await processScheduledWhatsAppMessages(new Date(), queued.message.id);
        const delivered = await prisma.scheduledWhatsAppMessage.findFirst({ where: { id: queued.message.id, clinicId: user.clinicId }, select: { status: true, failureReason: true } });
        if (delivered?.status === "SENT") {
          await prisma.patientIntakeRequest.update({ where: { id: intake.id }, data: { status: "SENT", sentAt: new Date() } });
        } else {
          warning = delivered?.failureReason || "The secure link is queued and awaiting WhatsApp delivery.";
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "WhatsApp could not send the link.";
      }
    }

    return NextResponse.json({
      id: intake.id,
      patientId: patient.id,
      link,
      mode: input.mode,
      status: input.mode === "fill-now" ? "OPENED" : warning ? "CREATED" : "SENT",
      expiresAt,
      warning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Please check the patient details." }, { status: 400 });
    }
    if (error instanceof PatientWhatsAppPolicyError) return NextResponse.json({ error: error.message }, { status: error.status });
    await reportError(error, { where: "api/patient-intake.create" });
    return NextResponse.json({ error: "The intake request could not be created." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiPermission("managePatients");
  if (!user) return response;
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
  const { user, response } = await requireApiPermission("editClinicalDraft");
  if (!user) return response;
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
    await reportError(error, { where: "api/patient-intake.finalize" });
    return NextResponse.json({ error: "The intake could not be finalized." }, { status: 500 });
  }
}
