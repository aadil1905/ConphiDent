export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import ClinicalRecordForm from "@/components/clinical/ClinicalRecordForm";
import Link from "next/link";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";

export default async function EditClinicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("correctClinical");
  const id = Number((await params).id);
  const record = await prisma.clinicalRecord.findFirst({ where: { id, clinicId: user.clinicId, enteredInErrorAt: null } });
  if (!record) notFound();
  const patients = await prisma.patient.findMany({
    where: { clinicId: user.clinicId, archivedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      appointments: {
        where: { status: { not: "Cancelled" }, archivedAt: null },
        select: { id: true, appointmentDate: true, appointmentTime: true, treatment: true, status: true },
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      },
    },
    orderBy: { fullName: "asc" },
  });
  const draft = record.status === "DRAFT";
  return (
    <WorkPage
      title={draft ? "Finish this note" : "Correct this note"}
      sub={
        draft
          ? "Fill in what is missing and sign it off."
          : "The original stays exactly as it was signed. Your changes are saved as a new, signed version."
      }
      actions={
        <Link
          href={`/dashboard/clinical-records/${record.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
        >
          See the note
        </Link>
      }
      context={
        <>
          <RailCard title="Where this note stands">
            <p className="text-[13px] text-text-muted">
              {draft
                ? "Saved as a draft. It does not count as the patient's note until it is signed."
                : `Signed, version ${record.version}. It counts as the patient's note right now.`}
            </p>
          </RailCard>
          <RailCard title="When you save">
            <p className="text-[13px] text-text-muted">
              {draft
                ? "The note is signed and attached to the visit you picked."
                : "A new version is signed and becomes current. The version you are looking at is kept, so the history is never rewritten."}
            </p>
          </RailCard>
        </>
      }
    >
      <ClinicalRecordForm patients={patients} selectedPatientId={record.patientId} editingRecord={record} />
    </WorkPage>
  );
}
