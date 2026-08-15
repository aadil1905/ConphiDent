export const dynamic = "force-dynamic";

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, humanTime, rupees } from "@/lib/format";
import PageHeader from "@/components/lists/PageHeader";
import ConversationComposer from "@/components/whatsapp/ConversationComposer";
import HandoffControl from "@/components/whatsapp/HandoffControl";

const DAY = 24 * 60 * 60 * 1000;
const BASE = "/dashboard/conversations";

const FILTERS = [
  { key: "reply", label: "Needs a reply" },
  { key: "enquiries", label: "Enquiries" },
  { key: "optedout", label: "Opted out" },
  { key: "all", label: "Everything" },
] as const;

const TABS = [
  ["Inbox", BASE],
  ["Automations", "/dashboard/automation"],
  ["What went out", "/dashboard/whatsapp-operations"],
  ["Approved answers", "/dashboard/ai-coach"],
  ["Setup", "/dashboard/settings/whatsapp"],
] as const;

const STATE_WORDS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "queued", tone: "text-text-muted" },
  SENT: { label: "sent", tone: "text-text-muted" },
  DELIVERED: { label: "delivered", tone: "text-text-muted" },
  READ: { label: "read", tone: "text-primary" },
  FAILED: { label: "did not go out", tone: "text-danger" },
};

function initialsOf(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "#"
  );
}

function href(changes: Record<string, string | number | undefined>, current: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    const text = String(value ?? "");
    if (text && text !== "reply") params.set(key, text);
  }
  const search = params.toString();
  return search ? `${BASE}?${search}` : BASE;
}

/** Two stamps on the same calendar day. */
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today", "Yesterday", then the date — the separator between days. */
function dayLabel(value: Date, now: Date) {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(value, now)) return "Today";
  if (sameDay(value, yesterday)) return "Yesterday";
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function MessagesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string; q?: string; show?: string }>;
}) {
  const user = await requireFeature("whatsapp");
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const show = FILTERS.some((f) => f.key === params.show) ? params.show! : "reply";
  const now = new Date();


  const search: Prisma.WhatsAppConversationWhereInput = q
    ? {
        OR: [
          { phone: { contains: q.replace(/\D/g, "") || q } },
          { patient: { fullName: { contains: q, mode: "insensitive" } } },
          { lead: { fullName: { contains: q, mode: "insensitive" } } },
        ],
      }
    : {};

  const [threadsRaw, totalCount] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where: {
        clinicId: user.clinicId,
        ...search,
        ...(show === "enquiries" ? { patientId: null, leadId: { not: null } } : {}),
        ...(show === "optedout" ? { consentStatus: "OPTED_OUT" } : {}),
      },
      orderBy: { lastMessageAt: "desc" },
      take: 60,
      select: {
        id: true,
        phone: true,
        status: true,
        automationMode: true,
        consentStatus: true,
        assignedUserId: true,
        label: true,
        lastMessageAt: true,
        patient: { select: { id: true, fullName: true } },
        lead: { select: { id: true, fullName: true, stage: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { direction: true, content: true, createdAt: true },
        },
      },
    }),
    prisma.whatsAppConversation.count({ where: { clinicId: user.clinicId } }),
  ]);

  // "Needs a reply" is honest: the last word in the chat was theirs.
  const decorated = threadsRaw.map((thread) => {
    const last = thread.messages[0];
    const needsReply = last?.direction === "INBOUND";
    let waitingCount = 0;
    for (const message of thread.messages) {
      if (message.direction === "INBOUND") waitingCount += 1;
      else break;
    }
    return { ...thread, last, needsReply, waitingCount };
  });
  const threads = show === "reply" ? decorated.filter((thread) => thread.needsReply) : decorated;

  const selectedId = Number(params.conversation) || threads[0]?.id || decorated[0]?.id;
  const active = selectedId
    ? await prisma.whatsAppConversation.findFirst({
        where: { id: selectedId, clinicId: user.clinicId },
        select: {
          id: true,
          phone: true,
          status: true,
          automationMode: true,
          consentStatus: true,
          assignedUserId: true,
          label: true,
          patient: { select: { id: true, fullName: true, phone: true } },
          lead: { select: { id: true, fullName: true, stage: true } },
          messages: {
            orderBy: { createdAt: "asc" },
            take: 100,
            select: { id: true, direction: true, content: true, createdAt: true, deliveryStatus: true },
          },
        },
      })
    : null;

  // Patient context for the rail — the four things worth knowing mid-chat.
  const context = active?.patient
    ? await (async () => {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [lastVisit, nextVisit, invoices, plan] = await Promise.all([
          prisma.appointment.findFirst({
            where: {
              clinicId: user.clinicId,
              patientId: active.patient!.id,
              archivedAt: null,
              appointmentDate: { lt: startOfDay },
              status: { not: "Cancelled" },
            },
            orderBy: { appointmentDate: "desc" },
            select: { appointmentDate: true },
          }),
          prisma.appointment.findFirst({
            where: {
              clinicId: user.clinicId,
              patientId: active.patient!.id,
              archivedAt: null,
              appointmentDate: { gte: startOfDay },
              status: { not: "Cancelled" },
            },
            orderBy: { appointmentDate: "asc" },
            select: { appointmentDate: true, appointmentTime: true },
          }),
          prisma.invoice.findMany({
            where: { clinicId: user.clinicId, patientId: active.patient!.id, voidedAt: null },
            select: {
              totalAmount: true,
              payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
            },
          }),
          prisma.treatmentPlan.findFirst({
            where: {
              clinicId: user.clinicId,
              patientId: active.patient!.id,
              cancelledAt: null,
              status: { notIn: ["Completed", "Declined"] },
            },
            orderBy: { updatedAt: "desc" },
            select: { title: true, status: true },
          }),
        ]);
        const owes = invoices.reduce((sum, invoice) => {
          const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
          return sum + Math.max(0, invoice.totalAmount - paid);
        }, 0);
        return { lastVisit, nextVisit, owes, plan };
      })()
    : null;

  const activeName = active?.patient?.fullName || active?.lead?.fullName || active?.phone || "";
  const firstName = activeName.split(" ")[0] || "them";
  const lastInbound = active?.messages.filter((message) => message.direction === "INBOUND").at(-1);
  const outsideWindow = !lastInbound || now.getTime() - lastInbound.createdAt.getTime() > DAY;
  const optedOut = active?.consentStatus === "OPTED_OUT";
  const isEnquiry = Boolean(active && !active.patient && active.lead);

  const quickReplies = isEnquiry
    ? [
        { label: "Share our prices", text: `Happy to help! Which treatment are you asking about? I can share the fee and how long it takes.` },
        { label: "Offer a consultation slot", text: `The quickest way to a clear answer is a short consultation. We have time tomorrow — would morning or evening suit you?` },
        { label: "Ask which area they live in", text: `Which area are you coming from? That helps us suggest the easiest time to visit.` },
      ]
    : [
        { label: "Soreness is normal", text: `A little soreness for two days is normal, ${firstName}. Take the painkiller as written on the prescription. If it wakes you tonight, call us in the morning and we will see you.` },
        { label: "Offer the next free slot", text: `We can fit you in — would tomorrow morning work, ${firstName}?` },
        { label: "Send the bill again", text: `Sharing your bill again, ${firstName}. You can pay by UPI or at the desk, whichever is easier.` },
      ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Messages"
        sub="Every WhatsApp thread with a patient, and everything that goes out on its own."
      />
      <div role="tablist" aria-label="Messages sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(([label, tabHref]) =>
          label === "Inbox" ? (
            <span key={label} role="tab" aria-selected="true" className="inline-flex min-h-11 flex-none items-center border-b-2 border-b-primary px-3.5 text-[13px] font-semibold text-heading">
              {label}
            </span>
          ) : (
            <Link key={label} role="tab" aria-selected="false" href={tabHref} className="inline-flex min-h-11 flex-none items-center border-b-2 border-b-transparent px-3.5 text-[13px] font-semibold text-text-muted hover:text-heading">
              {label}
            </Link>
          ),
        )}
      </div>

      {totalCount === 0 && !q ? (
        <section className="flex flex-col items-center gap-2 rounded-card border border-border bg-card px-6 py-14 text-center shadow-[var(--shadow)]">
          <MessagesSquare className="h-8 w-8 text-primary" strokeWidth={1.6} aria-hidden />
          <h2 className="text-[15px] font-semibold text-heading">Your inbox is ready</h2>
          <p className="max-w-xl text-[13px] text-text-muted">
            Connect the clinic&rsquo;s WhatsApp number and every patient chat lands here on its own.
          </p>
          <Link
            href="/dashboard/settings/whatsapp"
            className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Connect WhatsApp
          </Link>
        </section>
      ) : (
        <div className="grid min-h-[calc(100vh-280px)] items-stretch gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_270px]">
          {/* --- Thread list ------------------------------------------------ */}
          <section
            className={`${params.conversation ? "hidden lg:flex" : "flex"} min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]`}
          >
            <div className="flex flex-col gap-2 border-b border-border/70 p-3">
              <form action={BASE} className="contents">
                {show !== "reply" && <input type="hidden" name="show" value={show} />}
                <label className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-white px-3">
                  <span className="sr-only">Search conversations</span>
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Name or number"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-text-muted"
                  />
                </label>
              </form>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((filter) => (
                  <Link
                    key={filter.key}
                    href={href({ show: filter.key === "reply" ? undefined : filter.key, conversation: undefined }, { q })}
                    aria-current={show === filter.key ? "true" : undefined}
                    className={`inline-flex min-h-9 items-center rounded-pill border px-2.5 text-xs font-semibold whitespace-nowrap text-heading ${
                      show === filter.key ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {threads.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 px-4 pt-8 pb-9 text-center">
                  <p className="text-sm font-semibold text-heading">
                    {show === "reply" ? "Everyone has been answered. Nice." : "Nothing here"}
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {q ? "No chats match what you typed." : "New chats show up here the moment they arrive."}
                  </p>
                </div>
              )}
              {threads.map((thread) => {
                const name = thread.patient?.fullName || thread.lead?.fullName || thread.phone;
                const isActive = thread.id === active?.id;
                const tag = thread.consentStatus === "OPTED_OUT"
                  ? { label: "opted out", tone: "bg-danger-bg text-danger" }
                  : !thread.patient && thread.lead
                    ? { label: "enquiry", tone: "bg-secondary text-heading" }
                    : null;
                return (
                  <Link
                    key={thread.id}
                    href={href({ conversation: thread.id }, { q, show })}
                    aria-current={isActive ? "true" : undefined}
                    className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border/70 px-3 py-2.5 ${
                      thread.needsReply ? "border-l-[3px] border-l-primary" : "border-l-[3px] border-l-transparent"
                    } ${isActive ? "bg-primary-soft" : "hover:bg-muted"}`}
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-pill bg-secondary text-xs font-bold text-heading">
                      {initialsOf(name)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className={`truncate text-[13px] text-heading ${thread.needsReply ? "font-bold" : "font-semibold"}`}>
                        {name}
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {thread.last
                          ? `${thread.last.direction === "OUTBOUND" ? "You: " : ""}${thread.last.content}`
                          : "No messages yet"}
                      </span>
                      {tag && (
                        <span className={`mt-0.5 self-start rounded-pill px-2 py-0.5 text-[11px] font-semibold ${tag.tone}`}>
                          {tag.label}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-[11px] whitespace-nowrap text-text-muted" title={exactStamp(thread.lastMessageAt)}>
                        {humanTime(thread.lastMessageAt, now)}
                      </span>
                      {thread.waitingCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-primary px-1 text-[11px] font-bold text-white">
                          {thread.waitingCount}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
              <div className="flex flex-col gap-1.5 px-3 pt-3.5 pb-4">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">Older chats</p>
                <p className="text-xs text-text-muted">
                  {threads.length >= totalCount
                    ? `That is every chat — ${totalCount} in all.`
                    : show === "all"
                      ? `Showing the ${threads.length} most recent of ${totalCount} chats.`
                      : `Showing ${threads.length} of ${totalCount} chats — the rest are answered.`}
                </p>
                {show !== "all" && (
                  <Link
                    href={href({ show: "all", conversation: undefined }, { q })}
                    className="inline-flex min-h-10 w-fit items-center rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted"
                  >
                    Show everything
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* --- Conversation ----------------------------------------------- */}
          <section
            className={`${params.conversation ? "flex" : "hidden lg:flex"} min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]`}
          >
            {!active ? (
              <div className="grid flex-1 place-items-center p-8 text-center">
                <div>
                  <MessagesSquare className="mx-auto h-8 w-8 text-primary" strokeWidth={1.6} aria-hidden />
                  <p className="mt-2 text-sm font-semibold text-heading">Pick a chat</p>
                  <p className="mt-1 text-[13px] text-text-muted">Choose someone on the left to read the thread.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
                  <Link
                    href={href({ conversation: undefined }, { q, show })}
                    className="grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-control text-heading hover:bg-muted lg:hidden"
                    aria-label="Back to all chats"
                  >
                    ←
                  </Link>
                  <div className="min-w-0 flex-[1_1_180px]">
                    <p className="text-sm font-semibold text-heading">{activeName}</p>
                    <p className="text-xs text-text-muted">
                      {active.phone}
                      {optedOut ? " · asked us to stop" : active.status === "RESOLVED" ? " · resolved" : " · open"}
                    </p>
                  </div>
                  <HandoffControl
                    conversationId={active.id}
                    mode={active.automationMode}
                    status={active.status}
                    assignedUserId={active.assignedUserId}
                    label={active.label}
                  />
                </div>

                <div className="flex min-h-[220px] flex-1 flex-col justify-end overflow-y-auto bg-background px-4 py-3.5">
                  {active.messages.map((message, index) => {
                    const ours = message.direction === "OUTBOUND";
                    const state = ours ? STATE_WORDS[message.deliveryStatus] : null;
                    const previous = active.messages[index - 1];
                    const next = active.messages[index + 1];

                    // The date belongs once at the top of a day, not stamped on
                    // every line — four "5 Aug 2026"s in a row is noise.
                    const newDay = !previous || !sameDay(previous.createdAt, message.createdAt);
                    // A run of messages from one side reads as one turn.
                    const startsRun = newDay || previous.direction !== message.direction;
                    const endsRun =
                      !next ||
                      next.direction !== message.direction ||
                      !sameDay(message.createdAt, next.createdAt);

                    return (
                      <div key={message.id} className="flex flex-col">
                        {newDay && (
                          <div className="my-3 flex items-center gap-3" aria-hidden>
                            <span className="h-px flex-1 bg-border" />
                            <span className="rounded-pill bg-muted px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                              {dayLabel(message.createdAt, now)}
                            </span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        )}

                        <div
                          className={`flex max-w-[min(78%,34rem)] flex-col ${ours ? "self-end items-end" : "self-start items-start"} ${
                            startsRun ? "" : "mt-[3px]"
                          }`}
                        >
                          <div
                            className={`px-3.5 py-2.5 text-[13px] leading-[1.45] whitespace-pre-line shadow-[0_1px_2px_rgba(18,59,93,0.06)] ${
                              ours
                                ? "bg-primary text-white"
                                : "border border-border bg-card text-foreground"
                            } ${
                              // Square off the corner facing the run so a turn
                              // reads as one block rather than separate cards.
                              ours
                                ? `rounded-[1rem] ${startsRun ? "" : "rounded-tr-[0.3rem]"} ${endsRun ? "" : "rounded-br-[0.3rem]"}`
                                : `rounded-[1rem] ${startsRun ? "" : "rounded-tl-[0.3rem]"} ${endsRun ? "" : "rounded-bl-[0.3rem]"}`
                            }`}
                          >
                            {message.content}
                          </div>

                          {endsRun && (
                            <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
                              <span title={exactStamp(message.createdAt)}>{clockTime(message.createdAt)}</span>
                              {state && <span className={`font-semibold ${state.tone}`}>{state.label}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <ConversationComposer
                  conversationId={active.id}
                  firstName={firstName}
                  outsideWindow={outsideWindow}
                  optedOut={optedOut}
                  quickReplies={quickReplies}
                />
              </>
            )}
          </section>

          {/* --- Context rail ----------------------------------------------- */}
          {active && (
            <aside className="hidden min-w-0 flex-col gap-3 xl:flex">
              <section className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
                <p className="text-[13px] font-semibold text-heading">{activeName}</p>
                {active.patient && context ? (
                  <>
                    {[
                      {
                        label: "Last visit",
                        value: context.lastVisit
                          ? context.lastVisit.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                          : "Not yet",
                        tone: "text-heading",
                      },
                      {
                        label: "Next visit",
                        value: context.nextVisit
                          ? `${context.nextVisit.appointmentDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${context.nextVisit.appointmentTime}`
                          : "None booked",
                        tone: context.nextVisit ? "text-heading" : "text-danger",
                      },
                      {
                        label: "Owes",
                        value: context.owes > 0 ? rupees(context.owes) : "Nothing",
                        tone: context.owes > 0 ? "text-danger" : "text-success",
                      },
                      {
                        label: "Treatment plan",
                        value: context.plan ? `${context.plan.title} · ${context.plan.status.toLowerCase()}` : "No plan yet",
                        tone: "text-heading",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between gap-3 text-[13px]">
                        <span className="text-text-muted">{row.label}</span>
                        <span className={`text-right font-semibold ${row.tone}`}>{row.value}</span>
                      </div>
                    ))}
                    <Link href={`/dashboard/patients/${active.patient.id}`} className="text-xs font-semibold text-primary hover:underline">
                      Open {firstName}&rsquo;s file
                    </Link>
                  </>
                ) : (
                  <p className="text-[13px] text-text-muted">
                    {active.lead
                      ? `An enquiry — ${active.lead.stage.toLowerCase().replace(/_/g, " ")} so far. Not a patient yet.`
                      : "We do not know this number yet."}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
                <p className="text-[13px] font-semibold text-heading">Do it from here</p>
                {[
                  {
                    label: `Book ${firstName} a visit`,
                    linkTo: active.patient
                      ? `/dashboard/appointments/new?patient=${active.patient.id}`
                      : "/dashboard/appointments/new",
                  },
                  ...(active.patient && context && context.owes > 0
                    ? [{ label: `Collect the ${rupees(context.owes)} owing`, linkTo: "/dashboard/billing?show=due" }]
                    : []),
                  active.patient
                    ? { label: "Open the clinical notes", linkTo: `/dashboard/patients/${active.patient.id}?tab=Clinical` }
                    : { label: "Add them as a patient", linkTo: "/dashboard/patients?add=1" },
                ].map((action) => (
                  <Link
                    key={action.label}
                    href={action.linkTo}
                    className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold text-heading hover:bg-muted"
                  >
                    {action.label}
                  </Link>
                ))}
              </section>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
