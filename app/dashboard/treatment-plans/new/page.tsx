export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { humanTime, rupees } from "@/lib/format";
import TreatmentPlanForm from "@/components/clinical/TreatmentPlanForm";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";

const appointmentSelect = {
  id: true,
  appointmentDate: true,
  appointmentTime: true,
  treatment: true,
  status: true,
};

export default async function NewTreatmentPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitDate?: string }>;
}) {
  const user = await requirePermission("manageClinical");
  const { patientId, visitDate } = await searchParams;
  const selectedId = Number(patientId);

  const [patients, services, openPlans] = await Promise.all([
    prisma.patient.findMany({
      where: { clinicId: user.clinicId, archivedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        dateOfBirth: true,
        appointments: {
          where: { status: { not: "Cancelled" }, archivedAt: null },
          select: appointmentSelect,
          orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.clinicService.findMany({
      where: { clinicId: user.clinicId },
      select: { id: true, name: true, price: true, active: true },
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    Number.isInteger(selectedId)
      ? prisma.treatmentPlan.findMany({
          where: {
            clinicId: user.clinicId,
            patientId: selectedId,
            cancelledAt: null,
            status: { in: ["Proposed", "Accepted", "In Progress"] },
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: { id: true, title: true, status: true, estimatedCost: true, updatedAt: true },
        })
      : [],
  ]);

  const selectedPatient = Number.isInteger(selectedId)
    ? patients.find((patient) => patient.id === selectedId)
    : undefined;
  const now = new Date();
  const priced = services.filter((service) => service.active && service.price !== null).slice(0, 6);

  return (
    <WorkPage
      title="New treatment plan"
      sub="Agree the work and what it costs. It attaches to the visit you pick when you save."
      context={
        <>
          {selectedPatient && (
            <RailCard title="Who this is for">
              <p className="text-sm font-semibold text-heading">{selectedPatient.fullName}</p>
              <p className="text-[13px] text-text-muted">{selectedPatient.phone}</p>
              <Link
                href={`/dashboard/patients/${selectedPatient.id}?tab=Plans`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Open their file
              </Link>
            </RailCard>
          )}

          {openPlans.length > 0 && (
            <RailCard title="Already agreed with them">
              {openPlans.map((plan) => (
                <div key={plan.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <Link
                    href={`/dashboard/treatment-plans/${plan.id}`}
                    className="min-w-0 truncate font-semibold text-primary hover:underline"
                  >
                    {plan.title}
                  </Link>
                  <span className="tabular-nums whitespace-nowrap text-text-muted">
                    {plan.estimatedCost ? rupees(plan.estimatedCost) : "not priced"}
                  </span>
                </div>
              ))}
              <p className="text-xs text-text-muted">
                Check you are not quoting the same work twice — the newest was touched{" "}
                {humanTime(openPlans[0].updatedAt, now)}.
              </p>
            </RailCard>
          )}

          {priced.length > 0 && (
            <RailCard title="Your usual prices">
              {priced.map((service) => (
                <div key={service.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate text-foreground">{service.name}</span>
                  <span className="tabular-nums whitespace-nowrap text-text-muted">
                    {rupees(service.price ?? 0)}
                  </span>
                </div>
              ))}
              <Link
                href="/dashboard/settings/operations"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Change your prices
              </Link>
            </RailCard>
          )}

          <RailCard title="When you save">
            <p className="text-[13px] text-text-muted">
              The plan attaches to the visit you picked. The rows and prices you enter here are the
              same ones that go onto the invoice.
            </p>
          </RailCard>
        </>
      }
    >
      <TreatmentPlanForm
        patients={patients}
        services={services}
        initialPatientId={patientId || ""}
        initialVisit={visitDate}
      />
    </WorkPage>
  );
}
