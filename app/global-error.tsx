"use client";

import { useEffect } from "react";
// global-error replaces the root layout, so it has to pull in the tokens itself.
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-background p-6 font-sans text-foreground">
        <main className="w-full max-w-lg rounded-card border border-border bg-card p-8 text-center shadow-[var(--shadow)]">
          <h1 className="text-[22px] leading-tight font-bold text-heading">
            That screen didn&rsquo;t load
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-text-muted">
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
