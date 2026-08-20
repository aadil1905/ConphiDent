import { redirect } from "next/navigation";

/** Analytics and Reports are one screen now. */
export default function AnalyticsPage() {
  redirect("/dashboard/insights");
}
