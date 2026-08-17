import { createHash } from "node:crypto";

/** The fields the staff edit form can write, in a fixed order. */
export interface AppointmentRevisionSource {
  patientName: string;
  phone: string;
  appointmentDate: Date;
  appointmentTime: string;
  treatment: string;
  status: string;
  notes: string | null;
  locationId: number | null;
  providerId: number | null;
  chairId: number | null;
}

/**
 * A short token standing for "the appointment as this page read it".
 *
 * The edit form posts every field it holds, so without a check the second of
 * two people editing one visit silently reverts the first — including fields
 * they never looked at. The usual guard is a `version` column or an `updatedAt`
 * timestamp, and `Appointment` carries neither; adding one is a migration, and
 * a migration in this repository applies itself on the next deploy. So the
 * token is derived from the values instead. That needs no schema change, and
 * has the small bonus that a save re-writing identical values is not reported
 * as a conflict when nothing has actually moved.
 *
 * It is a change detector, not a secret: every field it covers is already on
 * screen in front of the person editing, and the API still checks tenancy,
 * permissions and each value on its own.
 */
export function appointmentRevision(appointment: AppointmentRevisionSource) {
  const fields = [
    appointment.patientName,
    appointment.phone,
    appointment.appointmentDate.toISOString(),
    appointment.appointmentTime,
    appointment.treatment,
    appointment.status,
    appointment.notes ?? "",
    String(appointment.locationId ?? ""),
    String(appointment.providerId ?? ""),
    String(appointment.chairId ?? ""),
  ];
  // JSON-encoded rather than joined on a separator, so a comma or a quote
  // inside a note cannot make two different appointments hash the same.
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 32);
}
