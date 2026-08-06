import { BellRing, CheckCircle2, Clock3, MessageCircle, RefreshCw, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import DeleteSubmitButton from "@/components/dashboard/DeleteSubmitButton";
import { deleteFollowUpAction } from "@/app/dashboard/delete-actions";
import { cancelFollowUpAction, completeFollowUpAction, generateFollowUpsAction, sendFollowUpAction, snoozeFollowUpAction } from "./actions";

const typeLabel: Record<string, string> = {
  LEAD_NURTURE: "Unbooked enquiry",
  MISSED_APPOINTMENT: "Missed appointment",
  CANCELLATION_RECOVERY: "Cancellation recovery",
  REACTIVATION: "Inactive patient",
  APPOINTMENT_FOLLOW_UP: "Appointment follow-up",
  TREATMENT_FOLLOW_UP: "Treatment follow-up",
  LABORATORY_FOLLOW_UP: "Laboratory follow-up",
  PAYMENT_FOLLOW_UP: "Payment follow-up",
  RECALL_FOLLOW_UP: "Recall follow-up",
  NEW_PATIENT_FOLLOW_UP: "New patient follow-up",
};
const typeStyle: Record<string, string> = {
  LEAD_NURTURE: "bg-violet-50 text-violet-700",
  MISSED_APPOINTMENT: "bg-amber-50 text-amber-800",
  CANCELLATION_RECOVERY: "bg-orange-50 text-orange-800",
  TREATMENT_FOLLOW_UP: "bg-fuchsia-50 text-fuchsia-800",
  RECALL_FOLLOW_UP: "bg-sky-50 text-sky-700",
  REACTIVATION: "bg-sky-50 text-sky-700",
};

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const user = await requirePermission("manageSchedule");
  const tasks = await prisma.followUpTask.findMany({
    where: { clinicId: user.clinicId },
    orderBy: [{ status: "asc" }, { scheduledFor: "desc" }],
    take: 200,
  });
  const pending = tasks.filter((task) => task.status === "PENDING");
  const sent = tasks.filter((task) => task.status === "SENT");
  const completed = tasks.filter((task) => task.status === "COMPLETED");
  const cards = [
    { label: "Ready to contact", value: pending.length, icon: BellRing, tone: "bg-amber-50 text-amber-800" },
    { label: "Messages sent", value: sent.length, icon: MessageCircle, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Completed", value: completed.length, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Work queue</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Follow-ups and recovery</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">One staff-owned queue for appointments, treatments, laboratory, payments, recalls, enquiries and missed visits.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/dashboard/conversations" className="inline-flex h-11 items-center rounded-xl border bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">Open inbox</Link><form action={generateFollowUpsAction}>
          <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
            <RefreshCw className="size-4" />Refresh queue
          </button>
        </form></div>
      </header>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        <strong>WhatsApp sending safeguard:</strong> messages are only sent when a staff member presses Send.
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-bold">{value}</p>
              </div>
              <div className={`grid size-10 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-center gap-2">
            <UserRoundPlus className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Action queue</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Refresh generates only new tasks; it does not duplicate pending or sent tasks.
          </p>
        </div>
        {tasks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Clock3 className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-3 font-semibold">No follow-ups have been generated yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Press Refresh follow-up queue to review eligible leads and patients.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <article key={task.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold">{task.patientName}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${typeStyle[task.taskType] || "bg-muted text-muted-foreground"}`}>
                        {typeLabel[task.taskType] || task.taskType}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.status === "PENDING" ? "bg-amber-100 text-amber-800" : task.status === "SENT" ? "bg-cyan-100 text-cyan-800" : task.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        {task.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{task.phone}</p>
                    <p className="mt-3 max-w-2xl text-sm">{task.message}</p>
                    {task.errorMessage && <p className="mt-2 text-xs text-rose-700">Send error: {task.errorMessage}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {task.status === "PENDING" && (
                      <form action={sendFollowUpAction}>
                        <input type="hidden" name="id" value={task.id} />
                        <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700">
                          <MessageCircle className="size-4" />Send WhatsApp
                        </button>
                      </form>
                    )}
                    {task.status !== "COMPLETED" && (
                      <form action={completeFollowUpAction}>
                        <input type="hidden" name="id" value={task.id} />
                        <button className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold transition hover:bg-muted">
                          Mark complete
                        </button>
                      </form>
                    )}
                    {!["COMPLETED", "CANCELLED"].includes(task.status) && <form action={snoozeFollowUpAction} className="flex gap-1"><input type="hidden" name="id" value={task.id} /><input required name="scheduledFor" type="datetime-local" className="h-10 rounded-xl border px-2 text-xs" /><button className="h-10 rounded-xl border px-3 text-sm font-semibold">Snooze</button></form>}
                    {!["COMPLETED", "CANCELLED"].includes(task.status) && <form action={cancelFollowUpAction}><input type="hidden" name="id" value={task.id} /><button className="h-10 rounded-xl border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">Cancel</button></form>}
                    <form action={deleteFollowUpAction}>
                      <input type="hidden" name="id" value={task.id} />
                      <DeleteSubmitButton confirmMessage={`Delete follow-up for ${task.patientName}?`} />
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
