import Link from "next/link";
import { Bot, PauseCircle, UserRound } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateConversationAction } from "../conversations/actions";

export const dynamic = "force-dynamic";

const modes = [
  { value: "BOT_ACTIVE", label: "Bot active", icon: Bot, copy: "Automation replies normally." },
  { value: "HUMAN_ACTIVE", label: "Human active", icon: UserRound, copy: "Staff owns the reply; automation is silent." },
  { value: "PAUSED", label: "Paused", icon: PauseCircle, copy: "Messages are recorded without replies." },
] as const;

export default async function AutomationPage() {
  const user = await requirePermission("manageSchedule");
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { clinicId: user.clinicId, status: { not: "RESOLVED" } },
    include: { patient: { select: { fullName: true } }, lead: { select: { fullName: true } }, assignedUser: { select: { fullName: true } } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  return <div className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Automation control</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Conversation handoff</h1><p className="mt-2 text-sm text-muted-foreground">Choose whether each active conversation is handled by the bot, your team, or held without automated replies.</p></header>
    <section className="grid gap-3 md:grid-cols-3">{modes.map(({ value, label, icon: Icon, copy }) => <article key={value} className="rounded-xl border bg-card p-4"><Icon className="size-5 text-primary"/><h2 className="mt-3 font-semibold">{label}</h2><p className="mt-1 text-sm text-muted-foreground">{copy}</p></article>)}</section>
    <section className="overflow-hidden rounded-2xl border bg-card"><div className="border-b px-5 py-4"><h2 className="font-bold">Active conversations</h2></div><div className="divide-y">{conversations.map((conversation) => { const name = conversation.patient?.fullName || conversation.lead?.fullName || conversation.phone; return <form action={updateConversationAction} key={conversation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{name}</p><p className="text-sm text-muted-foreground">{conversation.phone}{conversation.assignedUser ? ` · ${conversation.assignedUser.fullName}` : ""}</p></div><input type="hidden" name="id" value={conversation.id}/><input type="hidden" name="status" value={conversation.status}/><input type="hidden" name="assignedUserId" value={conversation.assignedUserId ?? ""}/><input type="hidden" name="label" value={conversation.label ?? ""}/><select name="automationMode" defaultValue={conversation.automationMode} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="BOT_ACTIVE">Bot active</option><option value="HUMAN_ACTIVE">Human active</option><option value="PAUSED">Paused</option></select><button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Save</button><Link href={`/dashboard/conversations?conversation=${conversation.id}`} className="text-sm font-semibold text-primary hover:underline">Open inbox</Link></form>; })}{!conversations.length && <p className="p-8 text-center text-sm text-muted-foreground">No active conversations.</p>}</div></section>
  </div>;
}
