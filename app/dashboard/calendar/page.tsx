import { redirect } from "next/navigation";

/** The diary is a view on Schedule now, so old links land in the week grid. */
export default function CalendarPage() {
  redirect("/dashboard/appointments?view=week");
}
