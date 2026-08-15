import type { AppointmentStatus } from "@/types/appointment";
import { STATUS_LABELS } from "@/lib/visit-status";

/** State is never colour alone — the word is always there too. */
const TONE: Record<AppointmentStatus, string> = {
  Pending: "bg-warning-bg text-warning",
  Confirmed: "bg-muted text-heading",
  Completed: "bg-success-bg text-success",
  Cancelled: "bg-danger-bg text-danger",
  "No-show": "bg-danger-bg text-danger",
};

export default function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${TONE[status]}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
