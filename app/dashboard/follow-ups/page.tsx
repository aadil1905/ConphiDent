import { redirect } from "next/navigation";

/** Callbacks and enquiries share one queue on Growth now. */
export default function FollowUpsPage() {
  redirect("/dashboard/growth?show=patients");
}
