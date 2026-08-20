"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setVisitStatusAction } from "@/app/dashboard/appointments/schedule-actions";
import { STATUS_LABELS, STATUS_VALUES } from "@/lib/visit-status";

const TONE: Record<string, string> = {
  Pending: "bg-warning-bg text-warning border-warning-border",
  Confirmed: "bg-muted text-heading border-border-strong",
  Completed: "bg-success-bg text-success border-success-border",
  Cancelled: "bg-danger-bg text-danger border-danger-border",
  "No-show": "bg-danger-bg text-danger border-danger-border",
};

const UNDO_MS = 8000;

/** Changes the visit status in place. No page to leave, no dialog to dismiss. */
export default function StatusSelect({
  appointmentId,
  status,
  patientName,
}: {
  appointmentId: number;
  status: string;
  patientName: string;
}) {
  const [value, setValue] = useState(status);
  const [, startTransition] = useTransition();

  const change = (next: string) => {
    const before = value;
    setValue(next);

    startTransition(() => {
      void setVisitStatusAction(appointmentId, next).then((result) => {
        if (!result.ok) {
          setValue(before);
          toast.error(result.message);
          return;
        }
        toast.success(
          `${patientName.split(" ")[0]} is now ${STATUS_LABELS[next].toLowerCase()}.`,
          {
            duration: UNDO_MS,
            action: {
              label: "Undo",
              onClick: () => {
                setValue(result.previous);
                startTransition(() => {
                  void setVisitStatusAction(appointmentId, result.previous);
                });
              },
            },
          },
        );
      });
    });
  };

  return (
    <select
      value={value}
      onChange={(event) => change(event.target.value)}
      aria-label={`Status for ${patientName}`}
      className={`min-h-11 cursor-pointer rounded-control border px-2.5 text-[13px] font-semibold ${
        TONE[value] ?? "bg-card text-heading border-border-strong"
      }`}
    >
      {STATUS_VALUES.map((option) => (
        <option key={option} value={option}>
          {STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );
}
