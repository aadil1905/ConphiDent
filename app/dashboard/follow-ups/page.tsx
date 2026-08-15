import { redirect } from "next/navigation";

/** The callback queue is the second tab on Growth now. */
export default function FollowUpsPage() {
  redirect("/dashboard/growth?tab=callbacks");
}
