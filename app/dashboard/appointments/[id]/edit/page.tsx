import { notFound } from "next/navigation";

import AppointmentForm from "@/components/appointments/AppointmentForm";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("appointments");
  const user = await requireUser();
  const { id } = await params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId)) notFound();

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
  });
  if (!appointment) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Appointments</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit appointment</h1>
        <p className="mt-1 text-muted-foreground">Update the appointment details for {appointment.patientName}.</p>
      </div>
      <AppointmentForm
        mode="edit"
        appointmentId={appointment.id}
        defaultValues={{
          patientName: appointment.patientName,
          phone: appointment.phone,
          appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
          appointmentTime: appointment.appointmentTime,
          treatment: appointment.treatment as "New Consultation" | "Follow up",
          status: appointment.status as "Pending" | "Confirmed" | "Completed" | "Cancelled",
          notes: appointment.notes ?? "",
        }}
      />
    </div>
  );
}
