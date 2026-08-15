import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <section className="w-full max-w-lg rounded-card border border-border bg-card p-8 text-center shadow-[var(--shadow)]">
        <span className="mx-auto grid size-12 place-items-center rounded-control bg-secondary text-heading">
          <FileQuestion className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-[26px] leading-tight font-bold text-heading">
          That page isn&rsquo;t here
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-text-muted">
          The link may be wrong, or the page may have moved. Head back to your workspace and carry
          on from there.
        </p>
        <Link
          href="/dashboard"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Today
        </Link>
      </section>
    </main>
  );
}
