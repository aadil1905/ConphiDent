import AppointmentForm from "../../../../components/appointments/AppointmentForm";
import PageIntro from "@/components/dashboard/PageIntro";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/features";

export default async function NewAppointmentPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; patientId?: string }> }) {
  await requireFeature("appointments");
  const user = await requirePermission("manageSchedule");
  const { returnTo, patientId } = await searchParams;
  const safeReturnTo = returnTo?.startsWith("/dashboard/patients/") ? returnTo : undefined;
  const patientIdNumber = Number(patientId);
  const [providers, chairs, patient] = await Promise.all([
    prisma.clinicProvider.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.clinicChair.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    Number.isInteger(patientIdNumber) ? prisma.patient.findFirst({ where: { id: patientIdNumber, clinicId: user.clinicId }, select: { fullName: true, phone: true } }) : null,
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageIntro
        eyebrow="Appointments"
        title="New Appointment"
        description="Schedule a clinic visit and start patient intake when needed."
        descriptionMarginClassName="mt-2"
      />

      <AppointmentForm providers={providers} chairs={chairs} returnTo={safeReturnTo} defaultValues={patient ? { patientName: patient.fullName, phone: patient.phone, treatment: "Follow Up" } : undefined} />
    </div>
  );
}
