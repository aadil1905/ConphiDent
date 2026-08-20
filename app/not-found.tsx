import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { brandFontVariables } from "@/lib/fonts";

/**
 * A 404 is reached from both sides of the login boundary, so it offers a public
 * way out as well as a workspace one. It previously sent everybody to
 * /dashboard, which bounces an anonymous visitor straight to the sign-in page.
 */
export default function NotFound() {
  return (
    <main className={`cf-portal ${brandFontVariables} grid min-h-screen place-items-center p-6`}>
      <section className="w-full max-w-xl rounded-card border border-border bg-card p-10 text-center shadow-[var(--shadow)]">
        <Image
          src="/conphident-logo-transparent.png"
          alt="ConphiDent"
          width={1764}
          height={864}
          className="mx-auto h-8 w-auto"
        />
        <p className="portal-kicker mt-8 justify-center">Error 404</p>
        <h1 className="mt-3 text-[30px] leading-tight font-semibold text-heading">
          That page isn&rsquo;t here
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[14px] leading-6 text-text-muted">
          The link may be wrong, or the page may have moved since it was shared.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Go to conphident.live <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to my workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
