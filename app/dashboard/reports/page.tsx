import Link from "next/link";
import { BarChart3, CalendarClock, CircleDollarSign, RefreshCcw, Target, TrendingUp, UserRoundCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const percentage = (numerator: number, denominator: number) => denominator ? Math.round((numerator / denominator) * 100) : 0;
const currency = (value: number) => `₹${value.toLocaleString("en-IN")}`;

const bookedStages = ["BOOKED", "VISITED", "CONVERTED"];
const visitedStages = ["VISITED", "CONVERTED"];

export default async function ReportsPage() {
  const user = await requireUser();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  from.setHours(0, 0, 0, 0);

  const [allLeads, recentLeads, followUps] = await Promise.all([
    prisma.lead.findMany({
      where: { clinicId: user.clinicId },
      select: { stage: true, source: true, lossReason: true, conversionValue: true, recoveredAt: true, createdAt: true },
    }),
    prisma.lead.findMany({
      where: { clinicId: user.clinicId, createdAt: { gte: from } },
      select: { stage: true, source: true, lossReason: true, conversionValue: true, recoveredAt: true, createdAt: true },
    }),
    prisma.followUpTask.findMany({
      where: { clinicId: user.clinicId, createdAt: { gte: from } },
      select: { status: true, taskType: true, sourceType: true, outcome: true, createdAt: true },
    }),
  ]);

  const total = allLeads.length;
  const booked = allLeads.filter((lead) => bookedStages.includes(lead.stage)).length;
  const visited = allLeads.filter((lead) => visitedStages.includes(lead.stage)).length;
  const converted = allLeads.filter((lead) => lead.stage === "CONVERTED").length;
  const lost = allLeads.filter((lead) => lead.stage === "LOST").length;
  const recovered = allLeads.filter((lead) => lead.recoveredAt).length;
  const actionableFollowUps = followUps.filter((task) => !["CANCELLED"].includes(task.status));
  const pendingFollowUps = followUps.filter((task) => task.status === "PENDING").length;
  const sentFollowUps = followUps.filter((task) => task.status === "SENT").length;
  const completedFollowUps = followUps.filter((task) => task.status === "COMPLETED").length;
  const failedFollowUps = followUps.filter((task) => task.status === "FAILED").length;
  const invoiceRecoveryTasks = followUps.filter((task) => task.sourceType === "INVOICE").length;
  const recoveryRate = percentage(completedFollowUps, actionableFollowUps.length);
  const aiValue = allLeads
    .filter((lead) => lead.source.toLowerCase() === "whatsapp" && lead.stage === "CONVERTED")
    .reduce((sum, lead) => sum + (lead.conversionValue || 0), 0);
  const recentCount = recentLeads.length;

  const sourceRows = [...new Set(allLeads.map((lead) => lead.source || "Other"))]
    .map((source) => {
      const rows = allLeads.filter((lead) => (lead.source || "Other") === source);
      const sourceBooked = rows.filter((lead) => bookedStages.includes(lead.stage)).length;
      const sourceConverted = rows.filter((lead) => lead.stage === "CONVERTED").length;
      return { source, enquiries: rows.length, booked: sourceBooked, converted: sourceConverted };
    })
    .sort((a, b) => b.enquiries - a.enquiries);

  const lossRows = [...new Set(allLeads.map((lead) => lead.lossReason).filter(Boolean) as string[])]
    .map((reason) => ({ reason, count: allLeads.filter((lead) => lead.lossReason === reason).length }))
    .sort((a, b) => b.count - a.count);

  const funnel = [
    { label: "Enquiries", value: total, color: "bg-sky-500" },
    { label: "Appointments booked", value: booked, color: "bg-violet-500" },
    { label: "Visits completed", value: visited, color: "bg-amber-500" },
    { label: "Treatment conversions", value: converted, color: "bg-emerald-500" },
  ];

  const cards = [
    { label: "Enquiry → appointment", value: `${percentage(booked, total)}%`, help: `${booked} bookings from ${total} enquiries`, icon: Target, tone: "bg-violet-50 text-violet-700" },
    { label: "Appointment → treatment", value: `${percentage(converted, booked)}%`, help: `${converted} conversions from booked leads`, icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Recovered leads", value: recovered.toString(), help: `${lost} leads currently marked lost`, icon: RefreshCcw, tone: "bg-cyan-50 text-cyan-700" },
    { label: "AI-attributed value", value: currency(aiValue), help: "WhatsApp leads marked Converted", icon: CircleDollarSign, tone: "bg-amber-50 text-amber-800" },
    { label: "Recovery completion", value: `${recoveryRate}%`, help: `${completedFollowUps} completed recovery task(s) in 30 days`, icon: UserRoundCheck, tone: "bg-emerald-50 text-emerald-700" },
  ];

  const insight = pendingFollowUps > 0
    ? `${pendingFollowUps} follow-up${pendingFollowUps === 1 ? " is" : "s are"} waiting for your team. Completing them is the clearest next step to recover enquiries.`
    : lost > 0
      ? `${lost} lost lead${lost === 1 ? " is" : "s are"} available for a recovery campaign. Create a follow-up instead of leaving them inactive.`
      : "Keep Lead CRM stages up to date. Your conversion report becomes more useful as your team records each outcome.";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">AI conversion coach</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Conversion intelligence</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">See what brings enquiries in, where they drop off, and which follow-ups create new opportunities.</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground">Last 30 days: {recentCount} new enquiries</div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, help, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p></div><div className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></div></div>
            <p className="mt-4 text-xs text-muted-foreground">{help}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2"><BarChart3 className="size-5 text-primary" /><h2 className="text-lg font-bold">Conversion funnel</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Counts update as your team moves leads through Lead CRM.</p>
          <div className="mt-6 space-y-5">{funnel.map((step, index) => <div key={step.label}><div className="flex justify-between gap-4 text-sm"><span className="font-semibold">{index + 1}. {step.label}</span><span className="text-muted-foreground">{step.value}</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${step.color}`} style={{ width: `${percentage(step.value, total)}%` }} /></div></div>)}</div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2"><CalendarClock className="size-5 text-primary" /><h2 className="text-lg font-bold">Follow-up performance</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Tasks created in the last 30 days.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-amber-50 p-4"><p className="text-sm text-amber-900">Awaiting action</p><p className="mt-2 text-3xl font-bold text-amber-950">{pendingFollowUps}</p><p className="mt-1 text-xs text-amber-800">{sentFollowUps} sent, awaiting outcome</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm text-emerald-800">Completed recovery</p><p className="mt-2 text-3xl font-bold text-emerald-900">{completedFollowUps}</p><p className="mt-1 text-xs text-emerald-800">{invoiceRecoveryTasks} invoice recovery task(s)</p></div></div>
          {failedFollowUps > 0 && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800">{failedFollowUps} recovery attempt{failedFollowUps === 1 ? "" : "s"} failed and needs a retry or different channel.</p>}
          <p className="mt-5 rounded-xl bg-sky-50 p-4 text-sm leading-6 text-sky-950">{insight}</p>
          <Link href="/dashboard/follow-ups" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Open follow-up workspace →</Link>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2"><UserRoundCheck className="size-5 text-primary" /><h2 className="text-lg font-bold">Source quality</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Compare the number and outcome of enquiries by source.</p>
          <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="pb-3 pr-3 font-semibold">Source</th><th className="pb-3 pr-3 text-right font-semibold">Enquiries</th><th className="pb-3 pr-3 text-right font-semibold">Booked</th><th className="pb-3 text-right font-semibold">Converted</th></tr></thead><tbody>{sourceRows.length === 0 ? <tr><td className="py-5 text-muted-foreground" colSpan={4}>No leads recorded yet.</td></tr> : sourceRows.map((item) => <tr key={item.source} className="border-b last:border-0"><td className="py-3 pr-3 font-medium">{item.source}</td><td className="py-3 pr-3 text-right">{item.enquiries}</td><td className="py-3 pr-3 text-right">{item.booked} <span className="text-xs text-muted-foreground">({percentage(item.booked, item.enquiries)}%)</span></td><td className="py-3 text-right">{item.converted}</td></tr>)}</tbody></table></div>
        </article>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-bold">Why leads are lost</h2>
          <p className="mt-1 text-sm text-muted-foreground">Reasons entered by staff when moving a lead to Lost.</p>
          <div className="mt-5 space-y-3">{lossRows.length === 0 ? <p className="text-sm text-muted-foreground">No loss reasons have been captured yet.</p> : lossRows.map((item) => <div key={item.reason} className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-sm"><span className="font-medium text-rose-950">{item.reason}</span><span className="font-bold text-rose-700">{item.count}</span></div>)}</div>
          <Link href="/dashboard/leads" className="mt-5 inline-flex text-sm font-semibold text-primary hover:underline">Review Lead CRM →</Link>
        </article>
      </section>

      <p className="rounded-2xl border border-border bg-muted/50 p-4 text-xs leading-5 text-muted-foreground"><strong>How these numbers work:</strong> they come from this clinic&apos;s Lead CRM and follow-up records. AI-attributed value includes only WhatsApp leads marked <strong>Converted</strong> with a value entered by your team—never an estimated amount.</p>
    </div>
  );
}
