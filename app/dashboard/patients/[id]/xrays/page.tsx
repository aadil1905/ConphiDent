import { redirect } from "next/navigation";

/** X-rays live on the Files tab of Patient 360 now. */
export default async function PatientXraysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/patients/${id}?tab=Files`);
}
