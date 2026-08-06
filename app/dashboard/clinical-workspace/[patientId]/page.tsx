export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, CalendarDays, ClipboardList } from "lucide-react";
import { notFound } from "next/navigation";
import { clearVisitDentalWorkspaceAction } from "@/app/dashboard/clinical-workspace/actions";
import DentalChartEditor from "@/components/clinical/DentalChartEditor";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function todayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function localDayRange(dayKey: string) {
  return {
    start: new Date(`${dayKey}T00:00:00.000+05:30`),
    end: new Date(`${dayKey}T23:59:59.999+05:30`),
  };
}

export default async function PatientClinicalWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ visitDate?: string; fromPatient?: string; new?: string }>;
}) {
  const user = await requireUser();
  const { patientId } = await params;
  const { visitDate, fromPatient, new: newWorkspace } = await searchParams;
  const id = Number(patientId);

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: user.clinicId },
    include: {
      appointments: {
        orderBy: { appointmentDate: "desc" },
        select: {
          id: true,
          appointmentDate: true,
          appointmentTime: true,
          treatment: true,
          status: true,
        },
      },
      clinicalRecords: { orderBy: { visitDate: "desc" }, take: 12 },
    },
  });

  if (!patient) notFound();

  const completedAppointments = patient.appointments.filter(
    (appointment) => appointment.status === "Completed",
  );
  const appointmentDates = completedAppointments.map((appointment) =>
    dateKey(appointment.appointmentDate),
  );
  const availableDates = Array.from(new Set(appointmentDates));
  const requestedDate =
    visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate) && availableDates.includes(visitDate)
      ? visitDate
      : null;
  const isNewWorkspace = newWorkspace === "1";
  const selectedVisitDate = isNewWorkspace ? todayKey() : requestedDate || appointmentDates[0] || todayKey();

  const visitDates = Array.from(new Set([selectedVisitDate, ...availableDates])).sort((left, right) =>
    right.localeCompare(left),
  );

  const appointmentsForSelectedDate = patient.appointments.filter(
    (appointment) =>
      appointment.status === "Completed" && dateKey(appointment.appointmentDate) === selectedVisitDate,
  );
  const recordsForSelectedDate = patient.clinicalRecords.filter(
    (record) => dateKey(record.visitDate) === selectedVisitDate,
  );
  const selectedRange = localDayRange(selectedVisitDate);
  const canEditSelectedWorkspace = isNewWorkspace || appointmentsForSelectedDate.length > 0;
  const dentalChartEntries = canEditSelectedWorkspace
    ? await prisma.dentalChartEntry.findMany({
        where: {
          patientId: patient.id,
          visitDate: { gte: selectedRange.start, lte: selectedRange.end },
        },
        orderBy: { toothNumber: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={fromPatient === "1" ? `/dashboard/patients/${patient.id}?visit=${selectedVisitDate}` : "/dashboard/clinical-workspace"}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            {fromPatient === "1" ? "Back to patient" : "Clinical workspace"}
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {patient.fullName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {patient.phone} � Dated tooth chart and editable clinical workspace
          </p>
        </div>
        <Link
          href={`/dashboard/patients/${patient.id}?visit=${selectedVisitDate}`}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-muted"
        >
          <ClipboardList className="size-4" />
          Open patient summary
        </Link>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <CalendarDays className="size-5 text-primary" />
              Visit date
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select from this patient&apos;s actual appointment dates. Every save from this
              workspace is attached to that appointment date in Patient Summary.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {visitDates.map((item) => (
            <Link
              key={item}
              href={`/dashboard/clinical-workspace/${patient.id}?visitDate=${item}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${
                selectedVisitDate === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-white hover:border-primary/40 hover:text-primary"
              }`}
            >
              {formatDate(new Date(`${item}T00:00:00.000+05:30`))}
            </Link>
          ))}
        </div>

        {!canEditSelectedWorkspace && (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
            This patient has no completed appointment yet. Complete the appointment first, then
            clinical notes can be saved under that exact appointment date.
          </p>
        )}

        {appointmentsForSelectedDate.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {appointmentsForSelectedDate.map((appointment) => (
              <div
                key={appointment.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm"
              >
                <p className="font-bold text-slate-900">
                  {appointment.appointmentTime} � {appointment.treatment}
                </p>
                <p className="mt-1 text-slate-500">Status: {appointment.status}</p>
              </div>
            ))}
          </div>
        )}

        {appointmentsForSelectedDate.length > 0 && (
          <form action={clearVisitDentalWorkspaceAction} className="mt-4">
            <input type="hidden" name="patientId" value={patient.id} />
            <input type="hidden" name="visitDate" value={selectedVisitDate} />
            <button
              type="submit"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-100 hover:shadow-sm"
            >
              Clear only this visit workspace
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Use this only for wrong test entries. It clears the selected date, not other dates.
            </p>
          </form>
        )}
      </section>

      {canEditSelectedWorkspace ? (
        <DentalChartEditor
          key={`${patient.id}-${selectedVisitDate}`}
          patientId={patient.id}
          entries={dentalChartEntries}
          visitDate={selectedVisitDate}
          isNewWorkspace={isNewWorkspace}
        />
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Workspace locked</h2>
          <p className="mt-2 text-sm text-slate-500">
            Mark one appointment as Completed to start recording clinical work for that visit date.
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Saved workspace for selected date</h2>
            <p className="text-sm text-muted-foreground">
              These entries are the same records that appear in the patient summary for this date.
            </p>
          </div>
          <p className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            {formatDate(new Date(`${selectedVisitDate}T00:00:00.000+05:30`))}
          </p>
        </div>

        {recordsForSelectedDate.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
            No workspace notes saved for this visit date yet. Select a tooth, add a condition/note,
            and click Save tooth entry.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-border rounded-2xl border">
            {recordsForSelectedDate.map((record) => (
              <article key={record.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{record.chiefComplaint}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(record.visitDate)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {record.diagnosis || "No diagnosis recorded"}
                </p>
                {record.clinicalNotes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm">{record.clinicalNotes}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
