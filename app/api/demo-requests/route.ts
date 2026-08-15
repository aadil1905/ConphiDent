import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, rateLimitResponse, requestIdentity } from "@/lib/rate-limit";

const demoRequest = z.object({ name: z.string().trim().min(2).max(120), clinicName: z.string().trim().min(2).max(160), phone: z.string().trim().min(7).max(32), email: z.string().trim().email().max(254), city: z.string().trim().min(2).max(120), doctorCount: z.string().trim().min(1).max(40), preferredTime: z.string().trim().min(1).max(80), companyWebsite: z.string().max(0).optional() });

export async function POST(request: Request) {
  const rate = consumeRateLimit(`demo-request:${requestIdentity(request)}`, 5, 60 * 60_000);
  if (!rate.allowed) return rateLimitResponse(rate);
  const input = Object.fromEntries((await request.formData()).entries());
  const parsed = demoRequest.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Please complete every field." }, { status: 400 });
  const { companyWebsite, ...data } = parsed.data;
  if (companyWebsite) return NextResponse.json({ success: true }, { status: 201 });
  await prisma.demoRequest.create({ data });
  return NextResponse.json({ success: true }, { status: 201 });
}
