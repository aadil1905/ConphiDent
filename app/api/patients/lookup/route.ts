import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { rupees } from "@/lib/format";

export const dynamic = "force-dynamic";

export type PatientMatch = {
  id: number;
  name: string;
  phone: string;
  /** "28 y · last seen 3 days ago · ₹1,400 due" */
  detail: string;
  /** Anything the person booking should see before they book. */
  alert: string;
};

/**
 * Feeds the "Who is coming in?" picker on Book a visit. It returns the few
 * things that change a booking decision — age, when they were last in, what
 * they owe, and anything flagged on their file.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "manageSchedule")) {
    return NextResponse.json({ matches: [] }, { status: 401 });
  }

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) return NextResponse.json({ matches: [] });

  const digits = query.replace(/\D/g, "");
  const patients = await prisma.patient.findMany({
    where: {
      clinicId: user.clinicId,
      archivedAt: null,
      OR: [
        { fullName: { contains: query, mode: "insensitive" } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
      ],
    },
    take: 6,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      dateOfBirth: true,
      medicalNotes: true,
      appointments: {
        where: { archivedAt: null },
        orderBy: { appointmentDate: "desc" },
        take: 1,
        select: { appointmentDate: true, treatment: true },
      },
      invoices: {
        where: { voidedAt: null, status: { not: "Paid" } },
        select: {
          totalAmount: true,
          payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
        },
      },
      labCases: {
        where: { cancelledAt: null, status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] } },
        select: { labName: true, caseType: true, dueDate: true },
      },
    },
  });

  const now = new Date();
  const matches: PatientMatch[] = patients.map((patient) => {
    const due = patient.invoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
      return sum + Math.max(0, invoice.totalAmount - paid);
    }, 0);
    const age = patient.dateOfBirth ? now.getFullYear() - patient.dateOfBirth.getFullYear() : null;
    const last = patient.appointments[0];
    const lateCase = patient.labCases.find((item) => item.dueDate && item.dueDate < now);

    return {
      id: patient.id,
      name: patient.fullName,
      phone: patient.phone,
      detail: [
        age !== null && `${age} y`,
        last ? last.treatment : "no visits yet",
        due > 0 ? `${rupees(due)} due` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      alert: [
        patient.medicalNotes?.trim(),
        lateCase ? `${lateCase.caseType} is running late at ${lateCase.labName}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  });

  return NextResponse.json({ matches });
}
