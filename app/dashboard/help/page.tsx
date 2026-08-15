import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/lists/PageHeader";

const ANSWERS = [
  {
    question: "Someone is in the chair — where do I write it down?",
    answer:
      "Open the patient and press Start visit. Chart the teeth, write the note, prescribe if you need to. Nothing waits on the booking being marked off; it all attaches to the day you pick when you save.",
    href: "/dashboard/clinical-workspace",
    label: "Open Clinical",
  },
  {
    question: "How do I take a payment without losing my place?",
    answer:
      "On Money, press Collect on the row. Put in the amount, pick how they paid, done. Part payments are fine and the receipt goes out on WhatsApp on its own.",
    href: "/dashboard/billing",
    label: "Open Money",
  },
  {
    question: "Who still needs ringing?",
    answer:
      "Today shows the ones that are overdue at the top. The full queue lives on Growth, with why each person is waiting and how many times you have tried.",
    href: "/dashboard/growth?tab=callbacks",
    label: "Open the queue",
  },
  {
    question: "The day I want has no times to pick",
    answer:
      "That day has no hours set up yet. You can still book it — type the time by hand and it saves. To fix it properly, set the opening hours for that day.",
    href: "/dashboard/settings/operations",
    label: "Set opening hours",
  },
  {
    question: "I need to find someone fast",
    answer:
      "Press Ctrl K (⌘K on a Mac) anywhere. A phone number usually finds a person quickest. It also runs things — type “book” to open the booking sheet.",
    href: "/dashboard/search",
    label: "Open search",
  },
  {
    question: "Can I get my data out?",
    answer:
      "Yes, whenever you like. Patients, visits and money each download as a spreadsheet. It is your clinic's data.",
    href: "/dashboard/exports",
    label: "Open exports",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="How things work here"
        sub="Short answers to the things people ask most often in the first week."
        actions={
          <Link
            href="/dashboard/settings?tab=records"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Settings
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        {ANSWERS.map((item) => (
          <section
            key={item.question}
            className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]"
          >
            <h2 className="text-base font-semibold text-heading">{item.question}</h2>
            <p className="mt-1.5 text-[13px] text-text-muted">{item.answer}</p>
            <Link
              href={item.href}
              className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
            >
              {item.label}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        ))}
      </div>

      <p className="rounded-control border border-border bg-muted px-3.5 py-3 text-[13px] text-text-muted">
        Stuck on something not here? Whoever set the clinic up can reach support for you.
      </p>
    </div>
  );
}
