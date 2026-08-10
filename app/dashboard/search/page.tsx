export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type SearchParams = { q?: string };
type SearchResult = { label: string; detail: string; href: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const q = (await searchParams).q?.trim() || "";
  const [patients, appointments, leads, invoices, labCases, conversations] = q ? await Promise.all([
    prisma.patient.findMany({ where: { clinicId: user.clinicId, OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, select: { id: true, fullName: true, phone: true }, take: 8 }),
    prisma.appointment.findMany({ where: { clinicId: user.clinicId, OR: [{ patientName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { treatment: { contains: q, mode: "insensitive" } }] }, select: { id: true, patientName: true, treatment: true }, take: 8 }),
    prisma.lead.findMany({ where: { clinicId: user.clinicId, OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }, select: { fullName: true, stage: true }, take: 8 }),
    prisma.invoice.findMany({ where: { patient: { clinicId: user.clinicId, OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } }, select: { id: true, invoiceNumber: true, patient: { select: { fullName: true } } }, take: 8 }),
    prisma.labCase.findMany({ where: { clinicId: user.clinicId, OR: [{ labName: { contains: q, mode: "insensitive" } }, { orderNumber: { contains: q, mode: "insensitive" } }, { patient: { fullName: { contains: q, mode: "insensitive" } } }] }, select: { id: true, orderNumber: true, caseType: true, patient: { select: { fullName: true } } }, take: 8 }),
    prisma.whatsAppConversation.findMany({ where: { clinicId: user.clinicId, OR: [{ phone: { contains: q } }, { patient: { fullName: { contains: q, mode: "insensitive" } } }, { lead: { fullName: { contains: q, mode: "insensitive" } } }, { messages: { some: { content: { contains: q, mode: "insensitive" } } } }] }, select: { id: true, phone: true, patient: { select: { fullName: true } }, lead: { select: { fullName: true } } }, take: 8 }),
  ]) : [[], [], [], [], [], []];
  const groups: Array<{ title: string; items: SearchResult[] }> = [
    { title: "Patients", items: patients.map((item) => ({ label: item.fullName, detail: `Patient · ${item.phone}`, href: `/dashboard/patients/${item.id}` })) },
    { title: "Appointments", items: appointments.map((item) => ({ label: item.patientName, detail: `Appointment · ${item.treatment}`, href: `/dashboard/appointments/${item.id}` })) },
    { title: "Leads", items: leads.map((item) => ({ label: item.fullName, detail: `Lead · ${item.stage}`, href: "/dashboard/leads" })) },
    { title: "Invoices", items: invoices.map((item) => ({ label: item.invoiceNumber, detail: `Invoice · ${item.patient.fullName}`, href: `/dashboard/billing/${item.id}` })) },
    { title: "Laboratory", items: labCases.map((item) => ({ label: item.orderNumber || `Lab case #${item.id}`, detail: `Lab · ${item.patient.fullName} · ${item.caseType}`, href: "/dashboard/laboratory" })) },
    { title: "WhatsApp", items: conversations.map((item) => ({ label: item.patient?.fullName || item.lead?.fullName || item.phone, detail: `Conversation · ${item.phone}`, href: `/dashboard/conversations?conversation=${item.id}` })) },
  ];
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);
  return <div className="dashboard-list-page mx-auto max-w-4xl space-y-6"><header><p className="text-sm font-semibold uppercase tracking-[.16em] text-primary">Global search</p><h1 className="mt-1 text-3xl font-bold">Search workspace</h1><p className="mt-2 text-muted-foreground">Patients, appointments, leads, invoices, laboratory, and WhatsApp threads.</p></header><form className="flex gap-2"><input name="q" defaultValue={q} autoFocus placeholder="Name, phone, treatment, invoice, lab, or message" className="h-12 flex-1 rounded-xl border bg-white px-4 shadow-sm"/><button className="rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Search</button></form><div className="overflow-hidden rounded-2xl border bg-white shadow-sm">{!q ? <p className="p-8 text-muted-foreground">Enter a query to search the connected clinic workspace.</p> : count ? <div className="divide-y">{groups.filter((group) => group.items.length).map((group) => <section key={group.title}><h2 className="bg-muted/50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.title}</h2>{group.items.map((item, index) => <Link key={`${item.href}-${index}`} href={item.href} className="block px-4 py-3 hover:bg-sky-50"><p className="font-semibold">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></Link>)}</section>)}</div> : <p className="p-8 text-muted-foreground">No results found for “{q}”.</p>}</div></div>;
}
