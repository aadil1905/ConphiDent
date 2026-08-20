import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type FormularyEntry = {
  genericName: string;
  strength: string;
  dosageForm: string;
  doseUnit: string;
  route: string;
  frequency: string;
  duration: string;
  /** How many times this clinic has written it — recent favourites sort first. */
  used: number;
};

/**
 * The clinic's own formulary, built from what it has actually prescribed. One
 * keystroke sequence resolves generic + strength + form together, instead of
 * three separate free-text boxes.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ entries: [] }, { status: 401 });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();

  const items = await prisma.prescriptionItem.findMany({
    where: {
      prescription: { clinicId: user.clinicId, cancelledAt: null },
      ...(query ? { genericName: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { id: "desc" },
    take: 400,
    select: {
      genericName: true,
      strength: true,
      dosageForm: true,
      doseUnit: true,
      route: true,
      frequency: true,
      duration: true,
    },
  });

  const byKey = new Map<string, FormularyEntry>();
  for (const item of items) {
    const key = `${item.genericName.toLowerCase()}|${item.strength.toLowerCase()}|${item.dosageForm.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.used += 1;
      continue;
    }
    byKey.set(key, { ...item, used: 1 });
  }

  const entries = [...byKey.values()].sort((a, b) => b.used - a.used).slice(0, 12);
  return NextResponse.json({ entries });
}
