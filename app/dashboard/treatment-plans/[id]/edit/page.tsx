import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import Link from "next/link";
import TreatmentPlanForm from "@/components/clinical/TreatmentPlanForm";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";
import { rupees } from "@/lib/format";

export default async function EditTreatmentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("manageClinical"); const id = Number((await params).id);
  const [plan, patients, services] = await Promise.all([prisma.treatmentPlan.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null }, include: { selectedTeeth: true, items: true } }), prisma.patient.findMany({ where: { clinicId: user.clinicId, archivedAt: null }, select: { id: true, fullName: true, phone: true, dateOfBirth: true, appointments: { where: { status: { not: "Cancelled" }, archivedAt: null }, select: { id: true, appointmentDate: true, appointmentTime: true, treatment: true, status: true }, orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }] } }, orderBy: { fullName: "asc" } }), prisma.clinicService.findMany({ where: { clinicId: user.clinicId }, select: { id: true, name: true, price: true, active: true }, orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }] })]);
  if (!plan) notFound();
  return (
    <WorkPage
      title="Continue this plan"
      sub="Change what you agreed without creating a duplicate."
      actions={
        <Link
          href={`/dashboard/treatment-plans/${plan.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
        >
          See the plan
        </Link>
      }
      context={
        <>
          <RailCard title="What this plan is worth">
            <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-secondary)]">
              <span className="text-text-muted">Agreed</span>
              <span className="font-semibold tabular-nums text-heading">
                {plan.estimatedCost ? rupees(plan.estimatedCost) : "not priced"}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-secondary)]">
              <span className="text-text-muted">Treatments on it</span>
              <span className="font-semibold tabular-nums text-heading">{plan.items.length}</span>
            </div>
          </RailCard>
          <RailCard title="When you save">
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
              What you agreed before stays in the plan&rsquo;s history, so anyone can see what
              changed and when. The rows and prices here are the same ones that go onto the invoice.
            </p>
          </RailCard>
        </>
      }
    >
      <TreatmentPlanForm patients={patients} services={services} editingPlan={plan} />
    </WorkPage>
  );
}
