import { reportError } from "@/lib/monitoring";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitResponse, requestIdentity } from "@/lib/rate-limit";

/**
 * Public intake for the setup portal. It records an onboarding request and
 * nothing else — no Clinic, no User, no tenant. Provisioning stays behind
 * platform authentication, so this endpoint cannot be used to bring a live
 * workspace into existence.
 */
const signup = z.object({
  clinicName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(32),
  city: z.string().trim().min(2).max(120),
  dentistCount: z.string().trim().min(1).max(40),
  chairCount: z.string().trim().min(1).max(40),
  currentSoftware: z.string().trim().max(160).optional().or(z.literal("")),
  whatsappNumber: z.string().trim().max(32).optional().or(z.literal("")),
  priorities: z.string().trim().max(400).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  // Honeypot: a real person never fills a field they cannot see. It accepts any
  // string so a filled one reaches the silent-success branch below rather than
  // failing validation, which would tell a bot exactly which field caught it.
  companyWebsite: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const rate = consumeRateLimit(`clinic-signup:${requestIdentity(request)}`, 5, 60 * 60_000);
  if (!rate.allowed) return rateLimitResponse(rate);

  const input = Object.fromEntries((await request.formData()).entries());
  const parsed = signup.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please complete every required field." },
      { status: 400 },
    );
  }

  const { companyWebsite, ...data } = parsed.data;
  // Answer a bot exactly as we answer a person, so it learns nothing.
  if (companyWebsite) return NextResponse.json({ success: true }, { status: 201 });

  try {
    await prisma.clinicSignup.create({
      data: {
        ...data,
        currentSoftware: data.currentSoftware || null,
        whatsappNumber: data.whatsappNumber || null,
        priorities: data.priorities || null,
        notes: data.notes || null,
      },
    });
  } catch (error) {
    // A clinic trying to sign up must never see a stack trace, and the detail
    // must never cross the wire — it goes to the server log instead.
    await reportError(error, { where: "api/clinic-signup" });
    return NextResponse.json(
      { error: "We couldn't record that just now. Please try again shortly." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
