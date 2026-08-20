"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Consistent navigation and mutation feedback for legacy and newer platform forms. */
export function PlatformInteractionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Opening");

  useEffect(() => {
    const finishId = window.setTimeout(() => setBusy(false), 80);
    document.querySelectorAll("[data-platform-pending='true']").forEach((element) => {
      delete (element as HTMLElement).dataset.platformPending;
    });
    return () => window.clearTimeout(finishId);
  }, [pathname, searchParams]);

  useEffect(() => {
    let timeoutId: number | undefined;
    const start = (nextLabel: string, fallbackMs: number) => {
      if (timeoutId) window.clearTimeout(timeoutId);
      setLabel(nextLabel);
      setBusy(true);
      timeoutId = window.setTimeout(() => setBusy(false), fallbackMs);
    };

    const handleClick = (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      anchor.dataset.platformPending = "true";
      start("Opening", 3500);
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      const submitter = event.submitter as HTMLElement | null;
      if (!form) return;
      form.dataset.platformPending = "true";
      if (submitter) submitter.dataset.platformPending = "true";
      start(form.method.toLowerCase() === "get" ? "Loading" : "Saving", 4500);
      window.setTimeout(() => {
        delete form.dataset.platformPending;
        if (submitter) delete submitter.dataset.platformPending;
      }, 4500);
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  return <>
    <div aria-hidden="true" className={`platform-progress ${busy ? "platform-progress--visible" : ""}`} />
    <div aria-live="polite" aria-atomic="true" role="status" className={`platform-loading-pill ${busy ? "platform-loading-pill--visible" : ""}`}>
      <span className="platform-loading-spinner" aria-hidden="true" />
      {label}…
    </div>
  </>;
}
