export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { exactStamp, humanTime } from "@/lib/format";
import { patientAge } from "@/lib/prescription-core";
import ClinicalRecordForm from "@/components/clinical/ClinicalRecordForm";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";

type Props = { searchParams: Promise<{ patientId?: string }> };

const appointmentSelect = {
  id: true,
  appointmentDate: true,
  appointmentTime: true,
  treatment: true,
  status: true,
};

export default async function NewClinicalRecordPage({ searchParams }: Props) {
  const user = await requirePermission("signClinical");
  const { patientId } = await searchParams;
  const selectedPatientId = Number(patientId);
  const patients = await prisma.patient.findMany({
    where: { clinicId: user.clinicId, archivedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      dateOfBirth: true,
      medicalNotes: true,
      appointments: {
        where: { status: { not: "Cancelled" }, archivedAt: null },
        select: appointmentSelect,
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      },
      clinicalRecords: {
        where: { enteredInErrorAt: null },
        orderBy: { visitDate: "desc" },
        take: 1,
        select: { visitDate: true, chiefComplaint: true, drugAllergies: true },
      },
    },
    orderBy: { fullName: "asc" },
  });
  const selectedPatient = Number.isInteger(selectedPatientId)
    ? patients.find((patient) => patient.id === selectedPatientId)
    : undefined;

  const now = new Date();
  const age = patientAge(selectedPatient?.dateOfBirth ?? null, now);
  const lastNote = selectedPatient?.clinicalRecords[0];
  const allergies = lastNote?.drugAllergies?.trim() || selectedPatient?.medicalNotes?.trim() || null;

  return (
    <WorkPage
      title={selectedPatient ? "Continue medical history" : "New clinical record"}
      sub={
        selectedPatient
          ? `Write up what happened at ${selectedPatient.fullName}'s visit. It attaches to the visit you pick — no new visit is created.`
          : "Write up what happened at a visit. It attaches to the visit you pick when you save."
      }
      context={
        selectedPatient ? (
          <>
            <RailCard title="Who this is for">
              <p className="text-sm font-semibold text-heading">{selectedPatient.fullName}</p>
              <p className="text-[13px] text-text-muted">
                {[age !== null ? `${age} y` : null, selectedPatient.phone].filter(Boolean).join(" · ")}
              </p>
              <Link
                href={`/dashboard/patients/${selectedPatient.id}?tab=Clinical`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Open their file
              </Link>
            </RailCard>

            <RailCard title="Read first">
              {allergies ? (
                <p className="rounded-control border border-danger-border bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger">
                  {allergies}
                </p>
              ) : (
                <p className="text-[13px] text-text-muted">
                  No allergies on file. Ask before you prescribe anything.
                </p>
              )}
            </RailCard>

            <RailCard title="Last time you saw them">
              {lastNote ? (
                <p title={exactStamp(lastNote.visitDate)} className="text-[13px] text-text-muted">
                  {humanTime(lastNote.visitDate, now)} — {lastNote.chiefComplaint || "no complaint written down"}
                </p>
              ) : (
                <p className="text-[13px] text-text-muted">
                  This is the first thing written down for them.
                </p>
              )}
            </RailCard>

            <RailCard title="When you save">
              <p className="text-[13px] text-text-muted">
                The note attaches to the visit you picked. Nothing waits on that visit being marked
                off, and the note stays a draft until it is signed.
              </p>
            </RailCard>
          </>
        ) : (
          <RailCard title="Pick a patient first">
            <p className="text-[13px] text-text-muted">
              Choose who this visit was for and their allergies, last note and history appear here.
            </p>
          </RailCard>
        )
      }
    >
      <ClinicalRecordForm patients={patients} selectedPatientId={selectedPatient?.id} />
    </WorkPage>
  );
}
