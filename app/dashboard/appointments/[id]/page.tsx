import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AppointmentActions from "@/components/appointments/AppointmentActions";
import StatusSelect from "@/components/schedule/StatusSelect";
import PageHeader from "@/components/lists/PageHeader";
import { requirePermission } from "@/lib/permissions";
import { requireFeature } from "@/lib/features";

type Props = { params: Promise<{ id: string }> };

export default async function AppointmentDetailsPage({ params }: Props) {
  await requireFeature("appointments");
  const user = await requirePermission("manageSchedule");
  const { id } = await params;
  const appointment = await prisma.appointment.findFirst({
    where: { id: Number(id), clinicId: user.clinicId, archivedAt: null },
    include: {
      patient: { include: { intakeRequests: { orderBy: { createdAt: "desc" }, take: 1 } } },
      labCases: {
        where: { cancelledAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, orderNumber: true, caseType: true, status: true, dueDate: true, labName: true },
      },
    },
  });

  if (!appointment) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-card border border-border bg-card px-5.5 py-14 text-center shadow-[var(--shadow)]">
        <h1 className="text-lg font-semibold text-heading">That visit is not here any more</h1>
        <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">It may have been archived, or the link is old.</p>
        <Link href="/dashboard/appointments" className="mt-2 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted">
          Back to the schedule
        </Link>
      </section>
    );
  }

  const firstName = appointment.patientName.split(" ")[0];
  const day = appointment.appointmentDate.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const needsIntake =
    appointment.source.toLowerCase() === "whatsapp" &&
    !["COMPLETED", "REVIEWED"].includes(appointment.patient?.intakeRequests[0]?.status || "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${firstName}'s visit`}
        sub={`${day} · ${appointment.appointmentTime} · ${appointment.treatment}`}
        actions={
          <>
            <StatusSelect
              appointmentId={appointment.id}
              status={appointment.status}
              patientName={appointment.patientName}
            />
            <Link
              href="/dashboard/appointments"
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
            >
              Back to the schedule
            </Link>
          </>
        }
      />

      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Who is coming</h2>
        <dl className="mt-3.5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-text-muted">Patient</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold text-heading">{appointment.patientName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Phone</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold tabular-nums text-heading">
              <a href={`tel:${appointment.phone}`} className="hover:underline">{appointment.phone}</a>
            </dd>
          </div>
        </dl>
        {appointment.patientId ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/dashboard/patients/${appointment.patientId}`}
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
            >
              Open patient 360
            </Link>
            {needsIntake ? (
              <Link
                href={`/dashboard/patient-intake?name=${encodeURIComponent(appointment.patientName)}&phone=${encodeURIComponent(appointment.phone)}`}
                className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Finish their intake
              </Link>
            ) : (
              <Link
                href={`/dashboard/patients/${appointment.patientId}/edit`}
                className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Continue medical history
              </Link>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The visit</h2>
        <dl className="mt-3.5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold text-text-muted">Day</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold text-heading">{day}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Time</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold tabular-nums text-heading">{appointment.appointmentTime}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Reason</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold text-heading">{appointment.treatment}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-text-muted">Booked from</dt>
            <dd className="mt-0.5 text-[length:var(--text-body)] font-semibold text-heading capitalize">{appointment.source || "clinic"}</dd>
          </div>
        </dl>
        {appointment.notes ? (
          <p className="mt-4 rounded-chip bg-muted px-3 py-2 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">{appointment.notes}</p>
        ) : null}
      </section>

      {appointment.labCases.length ? (
        <section className="rounded-card border border-warning-border bg-warning-bg px-5.5 py-4 shadow-[var(--shadow)]">
          <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The lab work this visit depends on</h2>
          <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
            Check the case is back before you confirm or move this visit.
          </p>
          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
            {appointment.labCases.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/laboratory/${item.id}`}
                className="rounded-control border border-warning-border bg-card p-3.5 text-sm transition-colors hover:border-primary"
              >
                <p className="font-semibold text-heading">
                  {item.orderNumber || `LAB-${item.id}`} · {item.caseType}
                </p>
                <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  {item.labName} · {item.status.replaceAll("_", " ").toLowerCase()} · due{" "}
                  {item.dueDate?.toLocaleDateString("en-IN") || "not set"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Things you can do</h2>
        <div className="mt-3.5">
          <AppointmentActions
            appointment={{
              id: appointment.id,
              patientName: appointment.patientName,
              phone: appointment.phone,
              appointmentDate: appointment.appointmentDate.toISOString(),
              appointmentTime: appointment.appointmentTime,
              treatment: appointment.treatment,
              status: appointment.status as never,
              notes: appointment.notes,
            }}
            reminderSentAt={appointment.reminderSentAt?.toISOString() ?? null}
          />
        </div>
      </section>
    </div>
  );
}
