import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/platform";
import { PlatformPageHeader, PlatformStatus } from "@/components/platform/PlatformPrimitives";

const PAGE_SIZE = 25;
const STATUSES = ["DRAFT", "ONBOARDING", "ACTIVE", "SUSPENDED", "ARCHIVED"];

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; whatsapp?: string; page?: string }> }) {
  await requirePlatformPermission("tenant.read");
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) || "";
  const status = STATUSES.includes(params.status || "") ? params.status : "";
  const whatsapp = ["connected", "disconnected"].includes(params.whatsapp || "") ? params.whatsapp : "";
  const page = Math.max(1, Number(params.page) || 1);
  const where = { AND: [
    ...(q ? [{ OR: [{ name: { contains: q, mode: "insensitive" as const } }, { brandName: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q, mode: "insensitive" as const } }, { users: { some: { role: "OWNER", email: { contains: q, mode: "insensitive" as const } } } }] }] : []),
    ...(status ? [{ status }] : []),
    ...(whatsapp === "connected" ? [{ whatsappConnection: { is: { disconnectedAt: null } } }] : whatsapp === "disconnected" ? [{ OR: [{ whatsappConnection: { is: null } }, { whatsappConnection: { is: { disconnectedAt: { not: null } } } }] }] : []),
  ] };
  const [total, clinics] = await Promise.all([
    prisma.clinic.count({ where }),
    prisma.clinic.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { users: { where: { role: "OWNER" }, select: { fullName: true, email: true, lastLoginAt: true }, take: 1 }, subscription: { include: { plan: true } }, whatsappConnection: { select: { disconnectedAt: true, displayPhoneNumber: true } }, _count: { select: { patients: true, appointments: true, users: true } } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (next: number) => new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(whatsapp ? { whatsapp } : {}), page: String(next) }).toString();
  return <main className="space-y-6 pb-12"><PlatformPageHeader eyebrow="Clinics" title="Tenant directory" description="Live tenant records with real subscriptions, ownership, WhatsApp state, and usage." actions={<Link href="/platform/clinics/new" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Provision clinic</Link>}/>
    <form className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4"><input name="q" defaultValue={q} placeholder="Clinic, workspace key, or owner email" className="h-10 rounded-lg border px-3 md:col-span-2"/><select name="status" defaultValue={status} className="rounded-lg border px-3"><option value="">All lifecycle states</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</select><select name="whatsapp" defaultValue={whatsapp} className="rounded-lg border px-3"><option value="">All WhatsApp states</option><option value="connected">Connected</option><option value="disconnected">Not connected</option></select><button className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Apply filters</button></form>
    <section className="overflow-hidden rounded-xl border bg-card"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b bg-muted text-xs uppercase tracking-wide text-text-muted"><tr><th className="px-5 py-3">Clinic</th><th className="px-5 py-3">Lifecycle</th><th className="px-5 py-3">Owner</th><th className="px-5 py-3">Subscription</th><th className="px-5 py-3">WhatsApp</th><th className="px-5 py-3">Usage</th><th className="px-5 py-3"/></tr></thead><tbody>{clinics.map((clinic) => { const owner = clinic.users[0]; const connected = Boolean(clinic.whatsappConnection && !clinic.whatsappConnection.disconnectedAt); return <tr key={clinic.id} className="border-b last:border-0"><td className="px-5 py-4"><p className="font-semibold">{clinic.brandName || clinic.name}</p><p className="text-xs text-text-muted">#{clinic.id} · {clinic.slug || "No subdomain"}</p></td><td className="px-5 py-4"><Status value={clinic.status}/></td><td className="px-5 py-4">{owner ? <><p>{owner.fullName}</p><p className="text-xs text-text-muted">{owner.email}</p></> : "No owner"}</td><td className="px-5 py-4">{clinic.subscription?.plan?.name || clinic.subscription?.status || "Not configured"}</td><td className="px-5 py-4"><Status value={connected ? "CONNECTED" : "NOT CONNECTED"}/><p className="mt-1 text-xs text-text-muted">{clinic.whatsappConnection?.displayPhoneNumber || ""}</p></td><td className="px-5 py-4 text-xs text-text-muted">{clinic._count.patients} patients · {clinic._count.appointments} appointments · {clinic._count.users} users</td><td className="px-5 py-4"><Link href={`/platform/clinics/${clinic.id}`} className="font-semibold text-primary">Open 360°</Link></td></tr>; })}</tbody></table></div>{!clinics.length && <p className="p-6 text-sm text-muted-foreground">No clinics match this view.</p>}<footer className="flex items-center justify-between border-t px-5 py-3 text-sm"><span>{total} clinic{total === 1 ? "" : "s"} · page {page} of {pages}</span><div className="flex gap-2">{page > 1 && <Link href={`/platform/organizations?${query(page - 1)}`} className="rounded border px-3 py-1">Previous</Link>}{page < pages && <Link href={`/platform/organizations?${query(page + 1)}`} className="rounded border px-3 py-1">Next</Link>}</div></footer></section>
  </main>;
}

function Status({ value }: { value: string }) { const tone = value === "ACTIVE" || value === "CONNECTED" ? "success" : value === "DRAFT" || value === "ONBOARDING" ? "warning" : value === "SUSPENDED" ? "danger" : "neutral"; return <PlatformStatus tone={tone}>{value}</PlatformStatus>; }
