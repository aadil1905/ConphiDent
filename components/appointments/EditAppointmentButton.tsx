import Link from "next/link";

export default function EditAppointmentButton({ appointmentId }: { appointmentId: number }) {
  return (
    <Link
      href={`/dashboard/appointments/${appointmentId}/edit`}
      className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
    >
      Change day or time
    </Link>
  );
}
