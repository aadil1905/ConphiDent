export const dynamic = "force-dynamic";

import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import WorkPage from "@/components/lists/WorkPage";
import ImagingImportForm from "@/components/imaging/ImagingImportForm";
import BackLink from "@/components/navigation/BackLink";

export default async function AddXrayPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  await requireFeature("imaging");
  const user = await requirePermission("uploadImaging");
  const params = await searchParams;
  const patientId = Number(params.patient);

  const [providers, patient, clinic] = await Promise.all([
    prisma.clinicProvider.findMany({
      where: { clinicId: user.clinicId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    Number.isInteger(patientId) && patientId > 0
      ? prisma.patient.findFirst({
          where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
          select: { id: true, fullName: true, phone: true },
        })
      : null,
    prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { timezone: true } }),
  ]);

  return (
    <WorkPage
      title={patient ? `Add an X-ray for ${patient.fullName.split(" ")[0]}` : "Add an X-ray"}
      sub="Three steps: whose it is, what it shows, then the file itself."
      actions={
        <BackLink
          fallback={patient ? `/dashboard/patients/${patient.id}/xrays` : "/dashboard/imaging"}
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
        >
          {patient ? "Back to their X-rays" : "Back to Imaging"}
        </BackLink>
      }
    >
      <ImagingImportForm
        providers={providers.map((provider) => ({ id: provider.id, label: provider.name }))}
        clinicTimezone={clinic?.timezone || "Asia/Kolkata"}
        initialPatient={patient ? { id: patient.id, label: `${patient.fullName} · ${patient.phone}` } : null}
        // Coming from a patient's own file, there is nobody else it could be.
        patientContext={patient ? { patientId: patient.id } : undefined}
        stepped
      />
    </WorkPage>
  );
}
