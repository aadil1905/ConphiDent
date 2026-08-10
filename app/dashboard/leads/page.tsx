export const dynamic = "force-dynamic";

import { BarChart3, CircleCheckBig, CircleX, Plus, RotateCcw, UserRoundPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import DeleteSubmitButton from "@/components/dashboard/DeleteSubmitButton";
import { deleteLeadAction } from "@/app/dashboard/delete-actions";
import { convertLeadToPatientAction, recoverLostLeadAction, saveLeadAction, updateLeadAction } from "./actions";

const stages = ["NEW", "CONTACTED", "BOOKED", "VISITED", "CONVERTED", "LOST"];
const sources = ["Manual", "WhatsApp", "Website", "Google", "Referral", "Walk-in"];
const stageStyles: Record<string, string> = {
  NEW: "bg-sky-100 text-sky-800",
  CONTACTED: "bg-violet-100 text-violet-800",
  BOOKED: "bg-amber-100 text-amber-800",
  VISITED: "bg-blue-100 text-blue-800",
  CONVERTED: "bg-emerald-100 text-emerald-800",
  LOST: "bg-rose-100 text-rose-800",
};

type Search = { stage?: string; source?: string; owner?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("manageSchedule");
  const filters = await searchParams;
  const selectedStage = stages.includes(filters.stage || "") ? filters.stage! : "";
  const selectedSource = sources.includes(filters.source || "") ? filters.source! : "";
  const selectedOwner = Number(filters.owner) || 0;
  const where = {
    clinicId: user.clinicId,
    ...(selectedStage ? { stage: selectedStage } : {}),
    ...(selectedSource ? { source: selectedSource } : {}),
    ...(selectedOwner ? { ownerId: selectedOwner } : {}),
  };
  const [leads, stageCounts, staff] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { owner: { select: { id: true, fullName: true } }, patient: { select: { id: true } }, activities: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.lead.groupBy({ by: ["stage"], where: { clinicId: user.clinicId }, _count: { stage: true } }),
    prisma.user.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const count = (stage: string) => stageCounts.find((lead) => lead.stage === stage)?._count.stage ?? 0;
  const converted = count("CONVERTED");
  const totalLeads = stageCounts.reduce((sum, lead) => sum + lead._count.stage, 0);
  const conversionRate = totalLeads ? Math.round((converted / totalLeads) * 100) : 0;
  const overdue = leads.filter((lead) => lead.nextFollowUpAt && lead.nextFollowUpAt < new Date() && !["CONVERTED", "LOST"].includes(lead.stage)).length;
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.conversionValue ?? 0), 0);
  const cards = [
    { label: "New enquiries", value: count("NEW"), icon: UserRoundPlus, tone: "bg-sky-50 text-sky-700" },
    { label: "Booked", value: count("BOOKED"), icon: CircleCheckBig, tone: "bg-amber-50 text-amber-700" },
    { label: "Converted", value: converted, icon: BarChart3, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Overdue actions", value: overdue, icon: CircleX, tone: "bg-rose-50 text-rose-700" },
  ];

  return (
    <div className="dashboard-list-page mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">AI conversion coach</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Lead CRM</h1>
        <p className="mt-2 text-muted-foreground">
          Capture enquiries, move them through the booking journey, and recover valuable lost opportunities.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Conversion health</h2>
            <p className="mt-1 text-sm text-muted-foreground">{conversionRate}% of all saved enquiries are marked converted. Pipeline value: ₹{pipelineValue.toLocaleString("en-IN")}.</p>
          </div>
          <span className="rounded-xl bg-emerald-50 px-4 py-2 text-xl font-bold text-emerald-700">{conversionRate}%</span>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Plus className="size-5 text-primary" />
          <h2 className="text-lg font-bold">Add enquiry</h2>
        </div>
        <form action={saveLeadAction} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input name="fullName" required placeholder="Patient name" className="h-11 rounded-xl border px-3" />
          <input name="phone" required placeholder="10-digit mobile number" className="h-11 rounded-xl border px-3" />
          <input name="email" type="email" placeholder="Email (optional)" className="h-11 rounded-xl border px-3" />
          <input name="serviceInterest" placeholder="Interested service" className="h-11 rounded-xl border px-3" />
          <select name="source" defaultValue="Manual" className="h-11 rounded-xl border bg-card px-3">
            {sources.map((source) => <option key={source}>{source}</option>)}
          </select>
          <input name="notes" placeholder="Enquiry note" className="h-11 rounded-xl border px-3" />
          <button className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90">
            Save enquiry
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Lead pipeline</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter the list, set a next action, and reopen a lost enquiry when the patient is ready.
              </p>
            </div>
            <form className="flex flex-wrap items-center gap-2">
              <select name="stage" defaultValue={selectedStage} className="h-10 rounded-lg border bg-card px-3 text-sm">
                <option value="">All stages</option>
                {stages.map((stage) => <option key={stage}>{stage}</option>)}
              </select>
              <select name="source" defaultValue={selectedSource} className="h-10 rounded-lg border bg-card px-3 text-sm">
                <option value="">All sources</option>
                {sources.map((source) => <option key={source}>{source}</option>)}
              </select>
              <select name="owner" defaultValue={selectedOwner || ""} className="h-10 rounded-lg border bg-card px-3 text-sm">
                <option value="">All owners</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
              </select>
              <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700">
                Apply
              </button>
                      <a href="/dashboard/leads" className="h-10 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">
                Clear
              </a>
            </form>
          </div>
        </div>
        {leads.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">No leads match these filters.</div>
        ) : (
          <div className="divide-y divide-border">
            {leads.map((lead) => (
              <article key={lead.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{lead.fullName}</p>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${stageStyles[lead.stage]}`}>{lead.stage}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {lead.phone} · {lead.source}
                      {lead.serviceInterest ? ` · ${lead.serviceInterest}` : ""}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">Owner: {lead.owner?.fullName ?? "Unassigned"}{lead.nextFollowUpAt ? ` · Next action ${lead.nextFollowUpAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : " · No next action"}</p>
                    {lead.nextFollowUpAt && lead.nextFollowUpAt < new Date() && !["CONVERTED", "LOST"].includes(lead.stage) && <p className="mt-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Action overdue</p>}
                    <p className="mt-2 text-sm">{lead.notes || "No notes added."}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Last activity: {lead.activities[0]?.content || "No activity"}
                    </p>
                    {lead.patient && <a href={`/dashboard/patients/${lead.patient.id}`} className="workspace-link mt-2 inline-flex">Open patient 360</a>}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2 xl:w-[430px]">
                    <form action={updateLeadAction} className="grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="id" value={lead.id} />
                      <select name="ownerId" defaultValue={lead.ownerId ?? ""} className="h-10 rounded-lg border bg-card px-3 text-sm">
                        <option value="">Unassigned</option>
                        {staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
                      </select>
                      {lead.stage === "CONVERTED" ? (
                        <div className="flex h-10 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800">Converted to patient</div>
                      ) : (
                        <select name="stage" defaultValue={lead.stage} className="h-10 rounded-lg border bg-card px-3 text-sm">
                          {stages.filter((stage) => stage !== "CONVERTED").map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                        </select>
                      )}
                      <input name="nextFollowUpAt" type="datetime-local" defaultValue={lead.nextFollowUpAt ? lead.nextFollowUpAt.toISOString().slice(0, 16) : ""} className="h-10 rounded-lg border px-3 text-sm" />
                      <input name="lossReason" defaultValue={lead.lossReason || ""} placeholder="Loss reason (if lost)" className="h-10 rounded-lg border px-3 text-sm" />
                      <input name="conversionValue" type="number" min="0" defaultValue={lead.conversionValue ?? ""} placeholder="Conversion value (Rs.)" className="h-10 rounded-lg border px-3 text-sm" />
                      <input name="notes" defaultValue={lead.notes || ""} placeholder="Update note" className="h-10 rounded-lg border px-3 text-sm sm:col-span-2" />
                      {lead.stage !== "CONVERTED" && <button className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 sm:col-span-2">Update lead</button>}
                    </form>
                    <div className="flex flex-wrap gap-2">
                      {lead.stage !== "CONVERTED" && (
                        <form action={convertLeadToPatientAction}>
                          <input type="hidden" name="id" value={lead.id} />
                          <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">
                            <CircleCheckBig className="size-4" />Convert to patient
                          </button>
                        </form>
                      )}
                      {lead.stage === "LOST" && (
                        <form action={recoverLostLeadAction}>
                          <input type="hidden" name="id" value={lead.id} />
                          <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                            <RotateCcw className="size-4" />Recover
                          </button>
                        </form>
                      )}
                      <form action={deleteLeadAction}>
                        <input type="hidden" name="id" value={lead.id} />
                        <DeleteSubmitButton confirmMessage={`Delete lead ${lead.fullName}?`} />
                      </form>
                    </div>
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
