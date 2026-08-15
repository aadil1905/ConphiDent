import { redirect } from "next/navigation";

/** The case paper is the Clinical tab of Patient 360 now. */
export default async function CasePaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/patients/${id}?tab=Clinical`);
}
