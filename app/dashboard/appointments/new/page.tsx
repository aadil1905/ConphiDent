export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildTimeSlots, defaultHours } from "@/lib/clinic-config";
import PageHeader from "@/components/lists/PageHeader";
import BookAVisit, { type BookableDay } from "@/components/appointments/BookAVisit";

const DAY = 24 * 60 * 60 * 1000;
const DAYS_SHOWN = 7;

function isoOf(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export default async function BookAVisitPage({
  searchParams,
}: {
  searchParams: Promise<{
    patient?: string;
    patientId?: string;
    date?: string;
    time?: string;
    returnTo?: string;
    /** An enquiry with no patient record yet still arrives with a name and number. */
    name?: string;
    phone?: string;
  }>;
}) {
  await requireFeature("appointments");
  const user = await requirePermission("manageSchedule");
  const params = await searchParams;
  const patientId = Number(params.patientId ?? params.patient);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(today.getTime() + DAYS_SHOWN * DAY);

  const [hours, services, chairs, booked, patient] = await Promise.all([
    prisma.clinicHours.findMany({ where: { clinicId: user.clinicId }, orderBy: { dayOfWeek: "asc" } }),
    prisma.clinicService.findMany({
      where: { clinicId: user.clinicId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true },
    }),
    prisma.clinicChair.findMany({
      where: { clinicId: user.clinicId, active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        archivedAt: null,
        status: { not: "Cancelled" },
        appointmentDate: { gte: today, lt: windowEnd },
      },
      select: { appointmentDate: true, appointmentTime: true, status: true },
    }),
    Number.isInteger(patientId) && patientId > 0
      ? prisma.patient.findFirst({
          where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
          select: { fullName: true, phone: true },
        })
      : null,
  ]);

  const hoursByDay = new Map(hours.map((entry) => [entry.dayOfWeek, entry]));

  // A day's free times are its configured slots minus whatever is already booked.
  const days: BookableDay[] = Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const date = new Date(today.getTime() + offset * DAY);
    const setup = hoursByDay.get(date.getDay()) ?? defaultHours[date.getDay()];
    const iso = isoOf(date);

    const takenToday = booked.filter((visit) => isoOf(visit.appointmentDate) === iso);
    const taken = new Set(takenToday.map((visit) => visit.appointmentTime));
    const slots = setup.isClosed
      ? []
      : buildTimeSlots(setup.openTime, setup.closeTime, setup.slotMinutes).filter(
          (time) => !taken.has(time),
        );

    const unconfirmed = takenToday.filter((visit) => visit.status === "Pending").length;

    return {
      iso,
      dow: date.toLocaleDateString("en-IN", { weekday: "short" }),
      date: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      label:
        offset === 0
          ? "today"
          : offset === 1
            ? "tomorrow"
            : date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }),
      slots,
      glance: setup.isClosed
        ? "Closed — unless someone opens a slot"
        : [
            `${takenToday.length} booked`,
            `${slots.length} free ${slots.length === 1 ? "time" : "times"}`,
            unconfirmed ? `${unconfirmed} not confirmed` : null,
          ]
            .filter(Boolean)
            .join(" · "),
    };
  });

  const reasons = services.length
    ? services.map((service) => service.name)
    : ["New consultation", "Follow up"];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Book a visit"
        sub="If a day has no times set up, you can still type one — it will save."
        actions={
          <Link
            href="/dashboard/appointments"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Schedule
          </Link>
        }
      />

      <BookAVisit
        days={days}
        reasons={reasons}
        chairs={chairs.map((chair) => chair.name)}
        defaultIso={params.date}
        defaultTime={params.time}
        defaultPatientName={patient?.fullName ?? params.name}
        defaultPhone={patient?.phone ?? params.phone}
      />
    </div>
  );
}
