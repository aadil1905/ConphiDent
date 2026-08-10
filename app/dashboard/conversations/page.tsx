import { CalendarPlus, CircleAlert, MessagesSquare, Search, Send, Settings2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { sendConversationMessageAction, updateConversationAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = { conversation?: string; q?: string; state?: string };

function messageTime(value: Date) {
  return value.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireFeature("whatsapp");
  const filters = await searchParams;
  const query = (filters.q || "").trim();
  const state = ["OPEN", "RESOLVED", "OPTED_OUT"].includes(filters.state || "") ? filters.state : "";
  const where = {
    clinicId: user.clinicId,
    ...(state ? { status: state } : {}),
    ...(query ? { OR: [
      { phone: { contains: query } },
      { patient: { fullName: { contains: query, mode: "insensitive" as const } } },
      { lead: { fullName: { contains: query, mode: "insensitive" as const } } },
      { messages: { some: { content: { contains: query, mode: "insensitive" as const } } } },
    ] } : {}),
  };
  const [conversations, staff] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true } },
        lead: { select: { id: true, fullName: true, stage: true } },
        assignedUser: { select: { id: true, fullName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 80,
    }),
    prisma.user.findMany({ where: { clinicId: user.clinicId, active: true }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const selectedId = Number(filters.conversation);
  const selectedSummary = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0];
  const selected = selectedSummary ? await prisma.whatsAppConversation.findFirst({
    where: { id: selectedSummary.id, clinicId: user.clinicId },
    include: {
      patient: { select: { id: true, fullName: true, phone: true } },
      lead: { select: { id: true, fullName: true, stage: true, nextFollowUpAt: true } },
      assignedUser: { select: { id: true, fullName: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 100 },
    },
  }) : null;

  return <div className="dashboard-list-page mx-auto max-w-[1440px] space-y-5">
    <header className="flex flex-col gap-3 rounded-2xl border bg-card px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Shared inbox</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Patient conversations</h1><p className="mt-1 text-sm text-muted-foreground">Clinic-owned WhatsApp threads, messages, and patient context in one place.</p></div>
      <Link href="/dashboard/whatsapp-operations" className="inline-flex h-9 shrink-0 items-center rounded-lg border bg-white px-3 text-sm font-semibold text-primary hover:bg-primary/5">Message diagnostics</Link>
    </header>

    {!conversations.length && !query && !state ? <section className="rounded-2xl border bg-card px-6 py-16 text-center shadow-sm"><div className="mx-auto max-w-xl"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MessagesSquare className="size-7" /></div><h2 className="mt-5 text-xl font-bold">Your inbox is ready for its first patient message</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Connect this clinic’s WhatsApp number, complete Meta’s webhook verification, then send an inbound message. Real patient threads will appear here automatically—no demo conversations are shown.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/dashboard/settings/whatsapp" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Settings2 className="size-4" />Connect WhatsApp</Link><Link href="/dashboard/whatsapp-operations" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-primary">Open diagnostics</Link></div></div></section> : <section className="grid min-h-[600px] overflow-hidden rounded-2xl border bg-card shadow-sm xl:grid-cols-[320px_minmax(0,1fr)_270px]">
      <aside className="border-b xl:border-r xl:border-b-0">
        <form className="border-b p-3"><label className="relative block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input name="q" defaultValue={query} placeholder="Search patient, phone, message" className="h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm"/><input type="hidden" name="state" value={state}/></label></form>
        <div className="flex gap-1 overflow-x-auto border-b p-2 text-xs font-semibold"><Link href="/dashboard/conversations" className={`rounded-lg px-3 py-2 ${!state ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>All</Link>{["OPEN", "RESOLVED", "OPTED_OUT"].map((value) => <Link key={value} href={`/dashboard/conversations?state=${value}`} className={`rounded-lg px-3 py-2 ${state === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{value.replaceAll("_", " ")}</Link>)}</div>
        <div className="max-h-[500px] overflow-y-auto divide-y">{conversations.map((conversation) => { const latest = conversation.messages[0]; const active = selected?.id === conversation.id; const name = conversation.patient?.fullName || conversation.lead?.fullName || conversation.phone; return <Link key={conversation.id} href={`/dashboard/conversations?conversation=${conversation.id}${query ? `&q=${encodeURIComponent(query)}` : ""}${state ? `&state=${state}` : ""}`} className={`block p-3 transition ${active ? "bg-primary/10" : "hover:bg-muted/60"}`}><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{name}</p><time className="shrink-0 text-[11px] text-muted-foreground">{messageTime(conversation.lastMessageAt)}</time></div><p className="mt-1 truncate text-xs text-muted-foreground">{latest?.content || "No saved message"}</p><div className="mt-2 flex flex-wrap gap-1"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">{conversation.status}</span>{conversation.assignedUser && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{conversation.assignedUser.fullName}</span>}</div></div></div></Link>; })}{!conversations.length && <div className="p-8 text-center text-sm text-muted-foreground">No conversations match this view.</div>}</div>
      </aside>

      <main className="flex min-w-0 flex-col">{!selected ? <div className="grid flex-1 place-items-center p-8 text-center"><div><MessagesSquare className="mx-auto size-10 text-primary"/><h2 className="mt-3 font-bold">No conversation selected</h2><p className="mt-1 text-sm text-muted-foreground">Inbound WhatsApp messages appear here automatically.</p></div></div> : <><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><p className="font-bold">{selected.patient?.fullName || selected.lead?.fullName || selected.phone}</p><p className="text-xs text-muted-foreground">{selected.phone} · {selected.status.replaceAll("_", " ")}</p></div><form action={updateConversationAction} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={selected.id}/><select name="assignedUserId" defaultValue={selected.assignedUserId ?? ""} className="h-9 rounded-lg border bg-white px-2 text-xs"><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select><input type="hidden" name="label" value={selected.label ?? ""}/><input type="hidden" name="status" value={selected.status === "OPEN" ? "RESOLVED" : "OPEN"}/><button className="h-9 rounded-lg border px-3 text-xs font-semibold">{selected.status === "OPEN" ? "Resolve" : "Reopen"}</button></form></div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">{selected.messages.map((message) => <div key={message.id} className={`flex ${message.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.direction === "OUTBOUND" ? "bg-primary text-primary-foreground" : "bg-white shadow-sm"}`}><p className="whitespace-pre-wrap">{message.content}</p><p className={`mt-1 text-[11px] ${message.direction === "OUTBOUND" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{messageTime(message.createdAt)} · {message.direction === "OUTBOUND" ? message.deliveryStatus : "Received"}</p>{message.failureReason && <p className="mt-1 text-[11px] text-rose-300">{message.failureReason}</p>}</div></div>)}{!selected.messages.length && <p className="py-16 text-center text-sm text-muted-foreground">No stored messages in this thread yet.</p>}</div>
        <form action={sendConversationMessageAction} className="flex gap-2 border-t p-3"><input type="hidden" name="conversationId" value={selected.id}/><textarea required name="content" maxLength={4096} placeholder="Write a WhatsApp reply…" className="min-h-10 flex-1 resize-none rounded-lg border bg-white px-3 py-2 text-sm"/><button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Send className="size-4"/>Send</button></form>
      </>}</main>

      <aside className="border-t p-4 xl:border-t-0 xl:border-l">{!selected ? null : <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient context</p>{selected.patient ? <><p className="mt-2 font-semibold">{selected.patient.fullName}</p><p className="text-sm text-muted-foreground">{selected.patient.phone}</p><Link href={`/dashboard/patients/${selected.patient.id}`} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">Open Patient 360</Link></> : <div className="mt-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">Unknown patient. Link or create a patient from this contact.</div>}</div><div className="space-y-2"><Link href={`/dashboard/appointments/new${selected.patient ? `?patientId=${selected.patient.id}` : ""}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold hover:bg-muted"><CalendarPlus className="size-4 text-primary"/>Book appointment</Link><Link href="/dashboard/follow-ups" className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold hover:bg-muted"><CircleAlert className="size-4 text-primary"/>Create follow-up</Link>{selected.lead ? <Link href="/dashboard/leads" className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold hover:bg-muted"><Users className="size-4 text-primary"/>Lead: {selected.lead.stage}</Link> : <Link href="/dashboard/leads" className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold hover:bg-muted"><UserPlus className="size-4 text-primary"/>Create lead</Link>}</div></div>}</aside>
    </section>}
  </div>;
}
