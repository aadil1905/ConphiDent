export const dynamic = "force-dynamic";

import { requireFeature } from "@/lib/features";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { bookableSlotsByWeekday } from "@/lib/appointment-scheduling";
import { appointmentDateKey, clinicDateAtOffset, clinicNow } from "@/lib/scheduling-core";
import PageHeader from "@/components/lists/PageHeader";
import BookAVisit, { type BookableDay } from "@/components/appointments/BookAVisit";
import BackLink from "@/components/navigation/BackLink";

const DAY = 24 * 60 * 60 * 1000;
const DAYS_SHOWN = 7;

/** yyyy-mm-dd -> the weekday number the hours tables are keyed by. */
function weekdayOf(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** A calendar label for an iso date, rendered without dragging in a local zone. */
function labelOf(iso: string, options: Intl.DateTimeFormatOptions) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
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

  // Everything below is reckoned in the clinic's own timezone, because that is
  // the zone the write validates against. Building this grid from server-local
  // time put a UTC-hosted deploy a day out for an IST clinic.
  const { byWeekday: slotsByWeekday, closedWeekdays, timezone } = await bookableSlotsByWeekday(user.clinicId);
  const clinicToday = clinicDateAtOffset(timezone, 0);
  const clinicTime = clinicNow(timezone).time;
  const [year, month, day] = clinicToday.split("-").map(Number);
  const windowStart = new Date(Date.UTC(year, month - 1, day));
  const windowEnd = new Date(windowStart.getTime() + DAYS_SHOWN * DAY);

  const [chairs, booked, patient] = await Promise.all([
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
        appointmentDate: { gte: windowStart, lt: windowEnd },
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

  // A day's free times are the branch's configured slots minus what is booked.
  // Nothing is offered that the write would refuse — they read the same rows.
  const days: BookableDay[] = Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const iso = clinicDateAtOffset(timezone, offset);
    const weekday = weekdayOf(iso);
    const configured = slotsByWeekday.get(weekday) ?? [];

    // Stored dates are UTC-anchored (canonical noon, legacy midnight), so the
    // day key is read back through the same helper the conflict check uses —
    // a server-local format would file a legacy row under the wrong day.
    const takenToday = booked.filter((visit) => appointmentDateKey(visit.appointmentDate) === iso);
    const taken = new Set(takenToday.map((visit) => visit.appointmentTime));
    const slots = configured.filter((time) => {
      if (taken.has(time)) return false;
      // Today's mornings are gone by the afternoon; the write refuses them,
      // so the picker must not offer them.
      return !(iso === clinicToday && time <= clinicTime);
    });

    const unconfirmed = takenToday.filter((visit) => visit.status === "Pending").length;

    return {
      iso,
      closed: closedWeekdays.has(weekday),
      dow: labelOf(iso, { weekday: "short" }),
      date: labelOf(iso, { day: "numeric", month: "short" }),
      label:
        offset === 0
          ? "today"
          : offset === 1
            ? "tomorrow"
            : labelOf(iso, { weekday: "long", day: "numeric", month: "short" }),
      slots,
      glance: closedWeekdays.has(weekday)
        ? "The clinic is closed this day"
        : configured.length === 0
        ? "No hours set up for this day"
        : [
            `${takenToday.length} booked`,
            `${slots.length} free ${slots.length === 1 ? "time" : "times"}`,
            unconfirmed ? `${unconfirmed} not confirmed` : null,
          ]
            .filter(Boolean)
            .join(" · "),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Book a visit"
        sub="Only times this branch is actually open for are offered, so anything you can pick will save."
        actions={
          <BackLink
            fallback="/dashboard/appointments"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Schedule
          </BackLink>
        }
      />

      <BookAVisit
        days={days}
        chairs={chairs.map((chair) => chair.name)}
        defaultIso={params.date}
        defaultTime={params.time}
        defaultPatientName={patient?.fullName ?? params.name}
        defaultPhone={patient?.phone ?? params.phone}
      />
    </div>
  );
}
