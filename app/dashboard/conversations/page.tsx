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
import ScrollToLatest from "@/components/whatsapp/ScrollToLatest";

const DAY = 24 * 60 * 60 * 1000;
const BASE = "/dashboard/conversations";

const FILTERS = [
  { key: "reply", label: "Needs a reply" },
  { key: "enquiries", label: "Enquiries" },
  { key: "optedout", label: "Opted out" },
  { key: "all", label: "Everything" },
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        sub="Every WhatsApp thread with a patient, and everything that goes out on its own."
      />
      {totalCount === 0 && !q ? (
        <section className="flex flex-col items-center gap-2 rounded-card border border-border bg-card px-6 py-14 text-center shadow-[var(--shadow)]">
          <MessagesSquare className="h-8 w-8 text-primary" strokeWidth={1.6} aria-hidden />
          <h2 className="text-[length:var(--text-body)] font-semibold text-heading">Your inbox is ready</h2>
          <p className="max-w-xl text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
            Connect the clinic&rsquo;s WhatsApp number and every patient chat lands here on its own.
          </p>
          <Link
            href="/dashboard/settings/whatsapp"
            className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Connect WhatsApp
          </Link>
        </section>
      ) : (
        /* One surface split in two, the way a messenger looks. On a phone the
           list is the whole screen and a chat covers it — data-open drives it. */
        <div className="wa" data-open={params.conversation ? "true" : "false"}>
          {/* --- Thread list ------------------------------------------------ */}
          <section className="wa__list min-h-0">
            <div className="flex flex-col gap-2 border-b border-border/70 bg-card p-3">
              <form action={BASE} className="contents">
                {show !== "reply" && <input type="hidden" name="show" value={show} />}
                <label className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-card px-3">
                  <span className="sr-only">Search conversations</span>
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Name or number"
                    className="min-w-0 flex-1 border-0 bg-transparent text-[length:var(--text-secondary)] text-foreground outline-none placeholder:text-text-muted"
                  />
                </label>
              </form>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((filter) => (
                  <Link
                    key={filter.key}
                    href={href({ show: filter.key === "reply" ? undefined : filter.key, conversation: undefined }, { q })}
                    aria-current={show === filter.key ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-pill border px-2.5 text-xs font-semibold whitespace-nowrap text-heading ${
                      show === filter.key ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {filter.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-card">
              {threads.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 px-4 pt-8 pb-9 text-center">
                  <p className="text-sm font-semibold text-heading">
                    {show === "reply" ? "Everyone has been answered. Nice." : "Nothing here"}
                  </p>
                  <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
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
                    className={`wa__row grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3 ${
                      thread.needsReply ? "border-l-[3px] border-l-primary" : "border-l-[3px] border-l-transparent"
                    }`}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-pill bg-muted text-[length:var(--text-secondary)] font-semibold text-heading">
                      {initialsOf(name)}
                    </span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className={`truncate text-[length:var(--text-secondary)] text-heading ${thread.needsReply ? "font-bold" : "font-semibold"}`}>
                        {name}
                      </span>
                      <span className="truncate text-xs text-text-muted">
                        {thread.last
                          ? `${thread.last.direction === "OUTBOUND" ? "You: " : ""}${thread.last.content}`
                          : "No messages yet"}
                      </span>
                      {tag && (
                        <span className={`mt-0.5 self-start rounded-pill px-2 py-0.5 text-[length:var(--text-micro)] font-semibold ${tag.tone}`}>
                          {tag.label}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="text-[length:var(--text-micro)] whitespace-nowrap text-text-muted" title={exactStamp(thread.lastMessageAt)}>
                        {humanTime(thread.lastMessageAt, now)}
                      </span>
                      {thread.waitingCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-primary px-1 text-[length:var(--text-micro)] font-bold text-primary-foreground">
                          {thread.waitingCount}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
              <div className="flex flex-col gap-1.5 px-3 pt-3.5 pb-4">
                <p className="text-[length:var(--text-micro)] font-semibold tracking-[0.14em] text-text-muted uppercase">Older chats</p>
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
                    className="inline-flex min-h-11 w-fit items-center rounded-control border border-border-strong bg-card px-3 text-xs font-semibold text-heading hover:bg-muted"
                  >
                    Show everything
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* --- Conversation ----------------------------------------------- */}
          <section className="wa__thread min-h-0">
            {!active ? (
              <div className="wa__paper grid flex-1 place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--wa-in)] shadow-[var(--shadow)]">
                    <MessagesSquare className="h-7 w-7 text-primary" strokeWidth={1.4} aria-hidden />
                  </span>
                  <p className="mt-4 font-[family-name:var(--font-display)] text-lg font-semibold text-heading">
                    Your clinic&rsquo;s WhatsApp
                  </p>
                  <p className="mt-1.5 text-[length:var(--text-body)] leading-relaxed text-text-muted">
                    Pick a chat on the left to read the thread and reply. Everything a patient
                    sends lands here on its own.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 border-b border-border/70 bg-card px-4 py-2.5">
                  <Link
                    href={href({ conversation: undefined }, { q, show })}
                    className="grid h-11 w-11 flex-none cursor-pointer place-items-center rounded-control text-heading hover:bg-muted lg:hidden"
                    aria-label="Back to all chats"
                  >
                    ←
                  </Link>
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-pill bg-muted text-xs font-semibold text-heading">
                    {initialsOf(activeName)}
                  </span>
                  <div className="min-w-0 flex-[1_1_180px]">
                    <p className="truncate text-sm font-semibold text-heading">{activeName}</p>
                    <p className="truncate text-xs text-text-muted">
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

                <div className="wa__paper min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-8">
                  <div className="flex min-h-full flex-col justify-end">
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
                            <span className="rounded-pill bg-muted px-2.5 py-1 text-[length:var(--text-micro)] font-semibold text-text-muted">
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
                            className={`wa__bubble ${ours ? "wa__bubble--out" : "wa__bubble--in"} ${
                              startsRun ? "wa__bubble--first" : ""
                            } px-3 py-2 text-[length:var(--text-secondary)] leading-[1.45] whitespace-pre-line shadow-[0_1px_1px_rgba(0,0,0,0.10)] text-[var(--wa-bubble-text)] ${
                              ours ? "bg-[var(--wa-out)]" : "bg-[var(--wa-in)]"
                            } ${
                              // Square off the corner facing the run so a turn
                              // reads as one block rather than separate cards.
                              ours
                                ? `rounded-[0.5rem] ${startsRun ? "rounded-tr-none" : ""}`
                                : `rounded-[0.5rem] ${startsRun ? "rounded-tl-none" : ""}`
                            }`}
                          >
                            {message.content}
                          </div>

                          {endsRun && (
                            <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[length:var(--text-micro)] text-text-muted">
                              <span title={exactStamp(message.createdAt)}>{clockTime(message.createdAt)}</span>
                              {state && <span className={`font-semibold ${state.tone}`}>{state.label}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Opens on the newest message; older ones are above it. */}
                  <ScrollToLatest conversationId={active.id} />
                  </div>
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

          {/* --- Context rail -----------------------------------------------
              The grid is two columns now, so the patient card sits under the
              thread list rather than claiming a third column of its own. */}
          {active && (
            <aside className="hidden min-w-0 flex-col gap-3">
              <section className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">{activeName}</p>
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
                      <div key={row.label} className="flex justify-between gap-3 text-[length:var(--text-secondary)]">
                        <span className="text-text-muted">{row.label}</span>
                        <span className={`text-right font-semibold ${row.tone}`}>{row.value}</span>
                      </div>
                    ))}
                    <Link href={`/dashboard/patients/${active.patient.id}`} className="text-xs font-semibold text-primary hover:underline">
                      Open {firstName}&rsquo;s file
                    </Link>
                  </>
                ) : (
                  <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                    {active.lead
                      ? `An enquiry — ${active.lead.stage.toLowerCase().replace(/_/g, " ")} so far. Not a patient yet.`
                      : "We do not know this number yet."}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]">
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">Do it from here</p>
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
                    className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
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
