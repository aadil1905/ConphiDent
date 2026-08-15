import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { patientSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";

export async function POST(request: Request) {
  const { user, response } = await requireApiPermission("managePatients");
  if (!user) return response;
  const rawInput = await request.json();
  try {
    if (typeof rawInput.fullName === "string") rawInput.fullName = rawInput.fullName.trim();
    if (typeof rawInput.phone === "string") rawInput.phone = rawInput.phone.replace(/\D/g, "").slice(-10);
    if (typeof rawInput.email === "string") rawInput.email = rawInput.email.trim().toLowerCase();
    if (typeof rawInput.address === "string") rawInput.address = rawInput.address.trim();
    if (typeof rawInput.medicalNotes === "string") rawInput.medicalNotes = rawInput.medicalNotes.trim();
    if (typeof rawInput.dateOfBirth === "string" && /^\d{2}-\d{2}-\d{4}$/.test(rawInput.dateOfBirth)) {
      const [day, month, year] = rawInput.dateOfBirth.split("-");
      rawInput.dateOfBirth = `${year}-${month}-${day}`;
    }
    const input = patientSchema.parse(rawInput);
    const patient = await prisma.patient.create({
      data: { clinicId: user.clinicId, ...input, email: input.email || null, dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null, gender: input.gender || null, address: input.address || null, medicalNotes: input.medicalNotes || null },
    });
    return NextResponse.json(patient, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed.", issues: error.flatten() }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const phone = typeof rawInput?.phone === "string" ? rawInput.phone.trim() : "";
      const existingPatient = phone ? await prisma.patient.findUnique({ where: { clinicId_phone: { clinicId: user.clinicId, phone } } }) : null;
      if (existingPatient) return NextResponse.json({ ...existingPatient, existed: true });
      return NextResponse.json({ error: "A patient with this phone number already exists." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create patient." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { user, response } = await requireApiPermission("managePatients");
  if (!user) return response;
  const phone = new URL(request.url).searchParams.get("phone")?.replace(/\D/g, "").slice(-10) || "";
  if (phone.length !== 10) return NextResponse.json({ patient: null });
  const patient = await prisma.patient.findUnique({ where: { clinicId_phone: { clinicId: user.clinicId, phone } }, select: { id: true, fullName: true, phone: true, archivedAt: true } });
  return NextResponse.json({ patient: patient?.archivedAt ? null : patient });
}
