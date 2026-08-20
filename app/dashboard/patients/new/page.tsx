import { redirect } from "next/navigation";

/** Adding a patient is a sheet on the list now, so old links land in the right place. */
export default function NewPatientPage() {
  redirect("/dashboard/patients?add=1");
}
