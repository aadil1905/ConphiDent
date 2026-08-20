import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";
import { consumeRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { user, response } = await requireApiFeature("imaging", "uploadImaging");
  if (!user) return response!;
  const rate = consumeRateLimit(`imaging-patient-search:${user.id}`, 60, 60_000);
  if (!rate.allowed) return rateLimitResponse(rate);
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) || "";
  if (query.length < 2) return NextResponse.json({ patients: [] });
  const numericId = /^\d+$/.test(query) ? Number(query) : null;
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      archivedAt: null,
      OR: [
        ...(numericId && Number.isSafeInteger(numericId) ? [{ id: numericId }] : []),
        { fullName: { contains: query, mode: "insensitive" } },
        { phone: { contains: query.replace(/\D/g, "") || "impossible-phone" } },
      ],
    },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: 20,
    select: { id: true, fullName: true, phone: true, dateOfBirth: true },
  });
  return NextResponse.json({ patients: patients.map((patient) => ({ id: patient.id, label: `${patient.fullName} · ${patient.phone}${patient.dateOfBirth ? ` · DOB ${patient.dateOfBirth.toISOString().slice(0, 10)}` : ""}` })) });
}
