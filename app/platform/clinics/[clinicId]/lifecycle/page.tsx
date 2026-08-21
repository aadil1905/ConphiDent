import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";
import { transitionClinicLifecycleAction } from "@/app/platform/actions";

const NEXT: Record<string, string[]> = { DRAFT: ["ONBOARDING", "ARCHIVED"], ONBOARDING: ["ACTIVE", "SUSPENDED", "ARCHIVED"], ACTIVE: ["SUSPENDED", "ARCHIVED"], SUSPENDED: ["ONBOARDING", "ACTIVE", "ARCHIVED"], ARCHIVED: ["ONBOARDING"] };

export default async function ClinicLifecyclePage({ params }: { params: Promise<{ clinicId: string }> }) {
  await requirePlatformPermission("tenant.suspend");
  const clinicId = Number((await params).clinicId);
  if (!Number.isInteger(clinicId)) notFound();
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true, brandName: true, slug: true, status: true, auditLogs: { take: 15, orderBy: { createdAt: "desc" }, select: { id: true, action: true, detail: true, createdAt: true } } } });
  if (!clinic) notFound();
  const choices = NEXT[clinic.status] || [];
  return <main className="mx-auto max-w-3xl space-y-6 pb-12"><header><Link href={`/platform/clinics/${clinic.id}`} className="text-sm font-semibold text-primary">Back to clinic 360°</Link><p className="platform-eyebrow mt-4">Tenant lifecycle</p><h1 className="mt-1 text-3xl font-bold">{clinic.brandName || clinic.name}</h1><p className="mt-2 text-sm text-muted-foreground">Current state: <strong>{clinic.status}</strong>. Lifecycle changes preserve tenant data and are recorded in the tenant audit log.</p></header>
    <section className="rounded-xl border bg-card p-6"><h2 className="text-xl font-bold">Change lifecycle state</h2>{choices.length ? <form action={transitionClinicLifecycleAction} className="mt-4 grid gap-4"><input type="hidden" name="clinicId" value={clinic.id}/><label className="text-sm font-semibold">New state<select required name="status" className="mt-1 block h-10 w-full rounded-lg border px-3">{choices.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-semibold">Reason<textarea required name="reason" maxLength={1000} className="mt-1 block min-h-24 w-full rounded-lg border p-3" placeholder="Explain why this lifecycle change is necessary."/></label><label className="text-sm font-semibold">Confirmation<input required name="confirmation" className="mt-1 block h-10 w-full rounded-lg border px-3" placeholder={`Type ${choices[0]} ${clinic.slug || clinic.id}`}/><span className="mt-1 block text-xs font-normal text-text-muted">Type the selected new state followed by {clinic.slug || clinic.id}.</span></label><button className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Confirm lifecycle change</button></form> : <p className="mt-3 text-sm text-muted-foreground">No valid lifecycle transition is configured for this record.</p>}</section>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-6 py-4"><h2 className="font-bold">Recent audit history</h2></div><div className="divide-y">{clinic.auditLogs.map((entry) => <article key={entry.id} className="px-6 py-4"><p className="font-semibold">{entry.action}</p>{entry.detail && <p className="mt-1 text-sm text-text-muted">{entry.detail}</p>}<time className="mt-2 block text-xs text-text-muted">{entry.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}{!clinic.auditLogs.length && <p className="p-6 text-sm text-muted-foreground">No audit entries have been recorded for this clinic.</p>}</div></section>
  </main>;
}
