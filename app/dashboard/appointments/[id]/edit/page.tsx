import { notFound } from "next/navigation";

import AppointmentForm from "@/components/appointments/AppointmentForm";
import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("appointments");
  const user = await requirePermission("manageSchedule");
  const { id } = await params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId < 1) notFound();

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: user.clinicId, archivedAt: null },
  });
  if (!appointment) notFound();

  const [clinic, locations, providers, chairs, services] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { timezone: true },
    }),
    prisma.clinicLocation.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [
          { active: true },
          ...(appointment.locationId ? [{ id: appointment.locationId }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        active: true,
        isPrimary: true,
        hours: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] },
        providers: { select: { providerId: true } },
        services: { select: { serviceId: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    }),
    prisma.clinicProvider.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [
          { active: true },
          ...(appointment.providerId ? [{ id: appointment.providerId }] : []),
        ],
      },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.clinicChair.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [
          { active: true },
          ...(appointment.chairId ? [{ id: appointment.chairId }] : []),
        ],
      },
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.clinicService.findMany({
      where: {
        clinicId: user.clinicId,
        OR: [{ active: true }, { name: appointment.treatment }],
      },
      select: { id: true, name: true, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="min-w-0">
        <h1 className="text-[22px] leading-tight font-bold text-heading">
          Change {appointment.patientName.split(" ")[0]}&rsquo;s visit
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Moving the day or time here is enough — the patient is told when you save.
        </p>
      </header>
      <AppointmentForm
        mode="edit"
        appointmentId={appointment.id}
        clinicTimezone={clinic?.timezone || "Asia/Kolkata"}
        locations={locations.map((location) => ({
          id: location.id,
          name: location.name,
          timezone: location.timezone,
          active: location.active,
          isPrimary: location.isPrimary,
          providerIds: location.providers.map((provider) => provider.providerId),
          serviceIds: location.services.map((service) => service.serviceId),
          hours: location.hours,
        }))}
        providers={providers}
        chairs={chairs}
        services={services}
        defaultValues={{
          patientName: appointment.patientName,
          phone: appointment.phone,
          appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
          appointmentTime: appointment.appointmentTime,
          treatment: appointment.treatment,
          status: appointment.status as "Pending" | "Confirmed" | "Completed" | "Cancelled" | "No-show",
          notes: appointment.notes ?? "",
          locationId: appointment.locationId,
          providerId: appointment.providerId,
          chairId: appointment.chairId,
        }}
      />
    </div>
  );
}
