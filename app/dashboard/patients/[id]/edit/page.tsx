export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import PageHeader from "@/components/lists/PageHeader";
import PatientForm from "@/components/patients/PatientForm";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("managePatients");
  const { id } = await params;
  const patient = await prisma.patient.findFirst({
    where: { id: Number(id), clinicId: user.clinicId, archivedAt: null },
  });
  if (!patient) notFound();

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title={`Edit ${patient.fullName.split(" ")[0]}'s details`}
        sub="Changes show up everywhere their name does, straight away."
        actions={
          <Link
            href={`/dashboard/patients/${patient.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            Back to their file
          </Link>
        }
      />
      <PatientForm
        mode="edit"
        patient={{ ...patient, dateOfBirth: patient.dateOfBirth?.toISOString() ?? null }}
      />
    </div>
  );
}
