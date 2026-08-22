export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import DentalChartEditor from "@/components/clinical/DentalChartEditor";
import type { DentitionStage } from "@/lib/dentition";
import { can, requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import BackLink from "@/components/navigation/BackLink";
import SafetyBanner from "@/components/clinical/SafetyBanner";
import { patientSafety } from "@/lib/patient-safety";

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

function ageLine(dateOfBirth: Date | null, gender: string | null) {
  const parts: string[] = [];
  if (dateOfBirth) {
    const years = Math.floor((Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 3600 * 1000));
    parts.push(`${years} y`);
  }
  if (gender) parts.push(gender);
  return parts.join(" · ");
}

export default async function PatientClinicalWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ visitDate?: string; fromPatient?: string; new?: string }>;
}) {
  const user = await requirePermission("viewClinical");
  const { patientId } = await params;
  const { visitDate, fromPatient } = await searchParams;
  const id = Number(patientId);

  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: user.clinicId, archivedAt: null },
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
      intakeRequests: {
        where: { drugAllergies: { not: null } },
        orderBy: [{ completedAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { drugAllergies: true, status: true },
      },
    },
  });

  if (!patient) notFound();

  // Every visit counts, whatever state the front desk left it in.
  const appointmentDates = patient.appointments.map((appointment) =>
    dateKey(appointment.appointmentDate),
  );
  const availableDates = Array.from(new Set(appointmentDates));
  const requestedDate =
    visitDate && /^\d{4}-\d{2}-\d{2}$/.test(visitDate) && availableDates.includes(visitDate)
      ? visitDate
      : null;
  const selectedVisitDate = requestedDate || appointmentDates[0] || todayKey();

  const visitDates = Array.from(new Set([selectedVisitDate, ...availableDates])).sort((left, right) =>
    right.localeCompare(left),
  );

  const appointmentsForSelectedDate = patient.appointments.filter(
    (appointment) => dateKey(appointment.appointmentDate) === selectedVisitDate,
  );
  const selectedAppointment = appointmentsForSelectedDate[0] || null;
  const selectedRange = localDayRange(selectedVisitDate);
  const canSignWorkspace = can(user.role, "signClinical");
  // Only the role decides whether you can write, never the visit's status.
  const canEditSelectedWorkspace = canSignWorkspace;
  const [dentalChartEntries, imagingProviders, clinic] = await Promise.all([canEditSelectedWorkspace
    ? prisma.dentalChartEntry.findMany({
        where: {
          clinicId: user.clinicId,
          patientId: patient.id,
          status: "CURRENT",
          visitDate: { gte: selectedRange.start, lte: selectedRange.end },
        },
        orderBy: { toothNumber: "asc" },
      })
    : Promise.resolve([]), prisma.clinicProvider.findMany({ where: { clinicId: user.clinicId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }), prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { timezone: true } })]);
  const encounter = canEditSelectedWorkspace
    ? await prisma.encounter.findFirst({
        where: selectedAppointment
          ? { clinicId: user.clinicId, patientId: patient.id, appointmentId: selectedAppointment.id }
          : { clinicId: user.clinicId, patientId: patient.id, occurredAt: { gte: selectedRange.start, lte: selectedRange.end } },
        orderBy: { createdAt: "desc" },
        include: {
          dentitionAssessments: { orderBy: { version: "desc" }, take: 1 },
          dentalFindings: {
            where: { status: "ACTIVE" },
            orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          },
        },
      })
    : null;
  const activeFindingByTooth = new Map(
    (encounter?.dentalFindings || []).map((finding) => [finding.toothCodeSnapshot, finding]),
  );
  const chartEntries = activeFindingByTooth.size
    ? Array.from(activeFindingByTooth.values()).map((finding) => ({
        toothNumber: finding.toothCodeSnapshot,
        condition: finding.condition,
        notes: finding.notes,
        recordType: finding.recordType,
        surfaces: finding.surfaces,
      }))
    : dentalChartEntries.map((entry) => ({
        toothNumber: entry.toothNumber,
        condition: entry.condition,
        notes: entry.notes,
      }));
  const initialDentitionStage = (encounter?.dentitionAssessments[0]?.stage || "NOT_ASSESSED") as DentitionStage;

  const initials = patient.fullName
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const safety = patientSafety({ medicalNotes: patient.medicalNotes, intakeAnswers: patient.intakeRequests });
  const details = ageLine(patient.dateOfBirth, patient.gender);
  const isToday = selectedVisitDate === todayKey();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 flex-none place-items-center rounded-pill bg-secondary text-sm font-bold text-heading">
            {initials}
          </span>
          <div className="min-w-0">
            <BackLink
              // The patient page never read ?visit= — it has no per-visit
              // anchor, only tab=Visits, which is the one it actually honours.
              fallback={fromPatient === "1" ? `/dashboard/patients/${patient.id}?tab=Visits` : "/dashboard/clinical-workspace"}
              className="text-xs font-semibold text-primary hover:underline"
            >
              ← {fromPatient === "1" ? "Back to the patient" : "Clinical"}
            </BackLink>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold tracking-[-0.01em] text-heading">{patient.fullName}</h1>
              <span className="text-[length:var(--text-secondary)] text-text-muted">
                {details ? `${details} · ` : ""}
                {patient.phone}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/laboratory/new?patientId=${patient.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            New lab order
          </Link>
          <Link
            href={`/dashboard/patients/${patient.id}?tab=Visits`}
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Patient 360
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">Visit:</span>
        {visitDates.map((item) => (
          <Link
            key={item}
            href={`/dashboard/clinical-workspace/${patient.id}?visitDate=${item}${fromPatient === "1" ? "&fromPatient=1" : ""}`}
            aria-current={selectedVisitDate === item ? "date" : undefined}
            className={`inline-flex min-h-11 items-center rounded-pill border px-3.5 text-xs font-semibold tabular-nums whitespace-nowrap ${
              selectedVisitDate === item
                ? "border-primary bg-secondary text-heading"
                : "border-border-strong bg-card text-heading hover:bg-muted"
            }`}
          >
            {item === todayKey() ? "Today" : formatDate(new Date(`${item}T00:00:00.000+05:30`))}
          </Link>
        ))}
        <span className="text-xs text-text-muted">
          {isToday
            ? "Anything you record now attaches to today's visit when you save."
            : "An older visit — new entries land on that date as a late addition."}
          {appointmentsForSelectedDate.length > 0 &&
            ` ${appointmentsForSelectedDate
              .map((appointment) => `${appointment.appointmentTime} · ${appointment.treatment}`)
              .join(" · ")}`}
        </span>
      </div>

      <SafetyBanner safety={safety} recordHref={`/dashboard/patients/${patient.id}/edit`} />

      {canEditSelectedWorkspace ? (
        <DentalChartEditor
          key={`${patient.id}-${selectedVisitDate}`}
          patientId={patient.id}
          appointmentId={selectedAppointment?.id || null}
          entries={chartEntries}
          visitDate={selectedVisitDate}
          dateOfBirth={patient.dateOfBirth?.toISOString() || null}
          initialDentitionStage={initialDentitionStage}
          isNewWorkspace={appointmentsForSelectedDate.length === 0}
          encounterId={encounter?.id || null}
          imagingProviders={imagingProviders.map((provider) => ({ id: provider.id, label: provider.name }))}
          clinicTimezone={clinic?.timezone || "Asia/Kolkata"}
        />
      ) : (
        <section className="rounded-card border border-dashed border-border-strong bg-card px-5.5 py-8 text-center">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Reading only, for you</h2>
          <p className="mt-1.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            Your role can read the chart but not write on it. An owner, administrator or dentist can chart and sign.
          </p>
        </section>
      )}

    </div>
  );
}
