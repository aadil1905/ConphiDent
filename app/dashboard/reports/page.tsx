import { redirect } from "next/navigation";

/** The conversion report is the "Where patients come from" tab on Insights. */
export default function ReportsPage() {
  redirect("/dashboard/insights?tab=growth");
}
