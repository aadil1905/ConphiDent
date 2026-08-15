import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPlatformPermission, requirePlatformPermission } from "@/lib/platform";

const take = 15;

export default async function PlatformSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await requirePlatformPermission("tenant.read");
  const q = (await searchParams).q?.trim().slice(0, 80) || "";
  const contains = { contains: q, mode: "insensitive" as const };
  const [clinics, subscriptions, connections, users] = q ? await Promise.all([
    prisma.clinic.findMany({ where: { OR: [{ name: contains }, { brandName: contains }, { slug: contains }] }, select: { id: true, name: true, brandName: true, slug: true, status: true }, take, orderBy: { name: "asc" } }),
    hasPlatformPermission(admin, "billing.read") ? prisma.tenantSubscription.findMany({ where: { OR: [{ plan: { is: { name: contains } } }, { clinic: { is: { name: contains } } }, { clinic: { is: { brandName: contains } } }] }, select: { id: true, status: true, clinic: { select: { id: true, name: true, brandName: true } }, plan: { select: { name: true } } }, take, orderBy: { updatedAt: "desc" } }) : Promise.resolve([]),
    hasPlatformPermission(admin, "whatsapp.read") ? prisma.clinicWhatsAppConnection.findMany({ where: { OR: [{ displayPhoneNumber: contains }, { phoneNumberId: contains }, { wabaId: contains }, { clinic: { is: { name: contains } } }] }, select: { clinic: { select: { id: true, name: true, brandName: true } }, displayPhoneNumber: true, phoneNumberId: true, disconnectedAt: true }, take, orderBy: { connectedAt: "desc" } }) : Promise.resolve([]),
    hasPlatformPermission(admin, "user.read") ? prisma.user.findMany({ where: { OR: [{ fullName: contains }, { email: contains }] }, select: { id: true, fullName: true, email: true, active: true, platformAdmin: true, clinic: { select: { name: true, brandName: true } } }, take, orderBy: { fullName: "asc" } }) : Promise.resolve([]),
  ]) : [[], [], [], []] as const;
  const total = clinics.length + subscriptions.length + connections.length + users.length;
  return <main className="space-y-6 pb-12"><header><p className="text-sm font-bold uppercase tracking-[.16em] text-[#176b87]">Control Center</p><h1 className="mt-1 text-3xl font-bold">Search</h1><p className="mt-2 text-sm text-muted-foreground">Results are restricted to the permissions of your current platform role.</p></header>
    <form className="flex max-w-2xl gap-2"><label className="sr-only" htmlFor="q">Search</label><input id="q" name="q" defaultValue={q} maxLength={80} placeholder="Search permitted records" className="h-11 min-w-0 flex-1 rounded-lg border bg-white px-3"/><button className="rounded-lg bg-[#176b87] px-4 text-sm font-semibold text-white">Search</button></form>
    {!q ? <Empty text="Enter a clinic, user email, plan, WABA ID, or phone number."/> : !total ? <Empty text={`No permitted records match “${q}”.`}/> : <div className="space-y-4"><Results title="Clinics" items={clinics.map((clinic) => <Link key={clinic.id} href={`/platform/clinics/${clinic.id}`}><b>{clinic.brandName || clinic.name}</b><span>{clinic.slug || "No workspace key"} · {clinic.status}</span></Link>)}/><Results title="Subscriptions" items={subscriptions.map((subscription) => <Link key={subscription.id} href="/platform/billing"><b>{subscription.clinic.brandName || subscription.clinic.name}</b><span>{subscription.plan?.name || "No plan"} · {subscription.status}</span></Link>)}/><Results title="Phone numbers" items={connections.map((connection) => <Link key={connection.phoneNumberId} href="/platform/whatsapp"><b>{connection.displayPhoneNumber || "Hidden display number"}</b><span>{connection.clinic.brandName || connection.clinic.name} · {connection.disconnectedAt ? "Disconnected" : "Connected"}</span></Link>)}/><Results title="Users" items={users.map((user) => <Link key={user.id} href="/platform/users"><b>{user.fullName}</b><span>{user.email} · {user.platformAdmin ? "Platform admin" : user.clinic.brandName || user.clinic.name} · {user.active ? "Active" : "Disabled"}</span></Link>)}/></div>}
  </main>;
}

function Empty({ text }: { text: string }) { return <section className="rounded-xl border border-dashed bg-white p-8 text-sm text-slate-600">{text}</section>; }
function Results({ title, items }: { title: string; items: React.ReactNode[] }) { return <section className="rounded-xl border bg-white"><h2 className="border-b px-5 py-4 font-bold text-[#123b5d]">{title} <span className="text-sm font-normal text-slate-500">({items.length})</span></h2>{items.length ? <div className="divide-y">{items.map((item, index) => <div key={index} className="px-5 py-3 text-sm [&_a]:block [&_a]:rounded-md [&_a]:outline-none [&_a:focus]:ring-2 [&_a:focus]:ring-[#176b87] [&_span]:mt-1 [&_span]:block [&_span]:text-xs [&_span]:text-slate-500">{item}</div>)}</div> : <p className="px-5 py-4 text-sm text-slate-500">No matching records.</p>}</section>; }
