export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquareQuote } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import PageHeader from "@/components/lists/PageHeader";
import { addFaqAction, toggleFaqAction } from "./actions";

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "PRICING", label: "What things cost" },
  { value: "EMI", label: "Paying in instalments" },
  { value: "TREATMENT", label: "About treatment" },
  { value: "OBJECTION", label: "When someone hesitates" },
];

const CATEGORY_WORDS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((item) => [item.value, item.label]),
);

const field =
  "min-h-11 w-full rounded-control border border-border bg-white px-3 text-sm text-foreground outline-none";

export default async function ApprovedAnswersPage() {
  await requireFeature("ai_coach");
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/dashboard");

  const faqs = await prisma.clinicFAQ.findMany({
    where: { clinicId: user.clinicId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  const live = faqs.filter((faq) => faq.active).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Messages"
        sub="Every WhatsApp thread with a patient, and everything that goes out on its own."
      />
      <div role="tablist" aria-label="Messages sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {[
          ["Inbox", "/dashboard/conversations"],
          ["Automations", "/dashboard/automation"],
          ["What went out", "/dashboard/whatsapp-operations"],
          ["Approved answers", "/dashboard/ai-coach"],
          ["Setup", "/dashboard/settings/whatsapp"],
        ].map(([label, href]) =>
          label === "Approved answers" ? (
            <span
              key={label}
              role="tab"
              aria-selected="true"
              className="inline-flex min-h-11 flex-none items-center border-b-2 border-b-primary px-3.5 text-[13px] font-semibold text-heading"
            >
              {label}
            </span>
          ) : (
            <Link
              key={label}
              role="tab"
              aria-selected="false"
              href={href}
              className="inline-flex min-h-11 flex-none items-center border-b-2 border-b-transparent px-3.5 text-[13px] font-semibold text-text-muted hover:text-heading"
            >
              {label}
            </Link>
          ),
        )}
      </div>

      <section className="rounded-card border border-border border-l-[3px] border-l-primary bg-card px-4.5 py-4 shadow-[var(--shadow)]">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-primary uppercase">
          What this is
        </p>
        <p className="max-w-[62rem] text-[15px] text-pretty">
          When someone asks a question on WhatsApp out of hours, these are the only answers the assistant
          is allowed to give. It will not make up a price, diagnose anything, or promise a result. If a
          question is not answered here, it says so and passes it to you.
        </p>
      </section>

      <section className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold text-heading">Add an answer</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Write it the way you would say it at the desk. &ldquo;Does a cleaning hurt?&rdquo;, &ldquo;Can I
          pay in instalments?&rdquo;, &ldquo;What does a first visit cost?&rdquo;
        </p>
        <form action={addFaqAction} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">What they ask</span>
            <input name="question" required className={field} placeholder="Does a cleaning hurt?" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">What we say back</span>
            <textarea
              name="answer"
              required
              rows={4}
              className="rounded-control border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none"
              placeholder="Not usually. Most people say it feels like a tickle. If your gums are tender we can numb the area first — just tell us when you sit down."
            />
          </label>
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-xs font-semibold text-heading">What it is about</span>
            <select name="category" className={field} defaultValue="GENERAL">
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className="min-h-11 w-fit cursor-pointer rounded-control border border-primary bg-primary px-5 text-[13px] font-semibold text-white hover:bg-primary-hover">
            Save it
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-4.5 py-3.5">
          <h2 className="text-base font-semibold text-heading">What the assistant can say</h2>
          <span className="text-xs text-text-muted">
            {faqs.length === 0
              ? "Nothing yet"
              : `${live} of ${faqs.length} switched on`}
          </span>
        </div>

        {faqs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquareQuote className="h-7 w-7 text-text-muted" strokeWidth={1.6} aria-hidden />
            <p className="text-[15px] font-semibold text-heading">No answers saved yet</p>
            <p className="max-w-[32rem] text-[13px] text-text-muted">
              Until you add some, the assistant stays quiet and passes every question to you. Start with the
              three you get asked most.
            </p>
          </div>
        ) : (
          faqs.map((faq) => (
            <article
              key={faq.id}
              className={`flex flex-col gap-3 border-b border-border px-4.5 py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between ${
                faq.active ? "" : "bg-muted/40"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-heading">{faq.question}</p>
                  <span className="rounded-pill bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                    {CATEGORY_WORDS[faq.category] ?? faq.category}
                  </span>
                  {!faq.active && (
                    <span className="rounded-pill bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                      Switched off
                    </span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-text-muted">{faq.answer}</p>
              </div>
              <form action={toggleFaqAction} className="flex-none">
                <input type="hidden" name="id" value={faq.id} />
                <input type="hidden" name="active" value={String(!faq.active)} />
                <button className="min-h-11 cursor-pointer rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted">
                  {faq.active ? "Switch off" : "Switch on"}
                </button>
              </form>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
