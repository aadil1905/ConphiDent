export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/features";
import PrescriptionForm from "@/components/clinical/PrescriptionForm";
import PageIntro from "@/components/dashboard/PageIntro";
import type { StructuredMedication } from "@/lib/prescription-core";
import { allergySummaryFrom } from "@/lib/prescription-core";
import SafetyBanner from "@/components/clinical/SafetyBanner";
import { patientSafety } from "@/lib/patient-safety";

const appointmentSelect = {
  id: true,
  appointmentDate: true,
  appointmentTime: true,
  treatment: true,
  status: true,
};

export default async function NewPrescriptionPage({ searchParams }: { searchParams: Promise<{ patientId?: string; visit?: string }> }) {
  const user = await requireFeature("clinical");
  const { patientId, visit } = await searchParams;
  const [patients, templates] = await Promise.all([prisma.patient.findMany({
    where: { clinicId: user.clinicId, archivedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      medicalNotes: true,
      intakeRequests: { where: { drugAllergies: { not: null } }, select: { drugAllergies: true, status: true }, orderBy: [{ completedAt: "desc" }, { id: "desc" }], take: 20 },
      appointments: {
        where: { status: { not: "Cancelled" }, archivedAt: null },
        select: appointmentSelect,
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      },
    },
    orderBy: { fullName: "asc" },
  }), prisma.prescriptionTemplate.findMany({ where: { clinicId: user.clinicId, active: true, reviewedAt: { not: null } }, select: { id: true, name: true, diagnosis: true, items: true }, orderBy: { name: "asc" } })]);
  const patientOptions = patients.map(({ intakeRequests, medicalNotes, ...patient }) => ({ ...patient, allergySummary: allergySummaryFrom(intakeRequests, medicalNotes) }));
  const selected = patients.find((entry) => entry.id === Number(patientId));
  const reviewedTemplates = templates.map((template) => ({ ...template, items: template.items as unknown as StructuredMedication[] }));

  return (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Prescriptions" title="New prescription" description="Write the script. It attaches to the visit you pick when you save." />
      {selected && <SafetyBanner safety={patientSafety({ medicalNotes: selected.medicalNotes, intakeAnswers: selected.intakeRequests })} recordHref={`/dashboard/patients/${selected.id}/edit`} />}
      <PrescriptionForm patients={patientOptions} templates={reviewedTemplates} initialPatientId={patientId ? Number(patientId) : undefined} initialVisit={visit} prescriberReady={Boolean(user.fullName.trim() && user.registrationNumber?.trim())} />
    </div>
  );
}
