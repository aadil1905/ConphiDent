"use client";

/**
 * Sends a client-side crash to `/api/client-error`.
 *
 * Best-effort and silent: an error boundary that throws while reporting an
 * error replaces one broken screen with a worse one. `keepalive` so the report
 * still goes if the boundary's remount tears the page down first.
 */
export function reportCrash(boundary: string, error: Error & { digest?: string }) {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        boundary,
        message: error?.message,
        digest: error?.digest,
        path: typeof window === "undefined" ? null : window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never be the reason a screen fails to render.
  }
}
