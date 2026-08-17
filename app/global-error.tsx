"use client";

import { useEffect } from "react";
// global-error replaces the root layout, so it has to pull in the tokens and
// the portal theme itself — neither reaches it from the layout above.
import "./globals.css";
import "./portal.css";
import { brandFontVariables } from "@/lib/fonts";
import { reportCrash } from "@/components/ui/report-crash";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportCrash("root", error);
  }, [error]);

  return (
    <html lang="en">
      <body className={`cf-portal ${brandFontVariables} grid min-h-screen place-items-center p-6`}>
        <main className="w-full max-w-lg rounded-card border border-border bg-card p-10 text-center shadow-[var(--shadow)]">
          <p className="portal-kicker">Something went wrong</p>
          <h1 className="mt-3 text-[26px] leading-tight font-semibold text-heading">
            That screen didn&rsquo;t load
          </h1>
          <p className="mt-3 text-[13.5px] leading-6 text-text-muted">
            Something went wrong on our side. Nothing you had saved has changed — try again.
          </p>
          <button
            type="button"
            onClick={unstable_retry}
            className="mt-6 inline-flex min-h-11 cursor-pointer items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
