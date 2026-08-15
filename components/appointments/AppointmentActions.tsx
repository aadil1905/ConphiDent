"use client";

import EditAppointmentButton from "./EditAppointmentButton";
import DeleteAppointmentDialog from "./DeleteAppointmentDialog";
import SendReminderButton from "./SendReminderButton";
import SendPatientResponseLinkButton from "./SendPatientResponseLinkButton";

import type { Appointment } from "@/types/appointment";

type Props = {
  appointment: Appointment;
  reminderSentAt?: string | null;
};

/**
 * The visit's action row. Status changes live in the status control up top —
 * this row is for messages, edits and archiving.
 */
export default function AppointmentActions({ appointment, reminderSentAt }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SendReminderButton appointmentId={appointment.id} sentAt={reminderSentAt ?? null} />
      <SendPatientResponseLinkButton appointmentId={appointment.id} />
      <EditAppointmentButton appointmentId={appointment.id} />
      <DeleteAppointmentDialog appointmentId={appointment.id} />
    </div>
  );
}
