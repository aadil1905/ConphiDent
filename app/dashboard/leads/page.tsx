import { redirect } from "next/navigation";

/** Enquiries live on Growth now. */
export default function LeadsPage() {
  redirect("/dashboard/growth");
}
