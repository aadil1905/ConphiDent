"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The app-wide back rule: a back control returns you to wherever you actually
 * came from — the patient profile, the schedule, a search — and falls back to
 * its labelled destination otherwise.
 *
 * Two things it must not do. It must not trust `document.referrer`: the App
 * Router navigates client-side, so the referrer stays whatever loaded the tab
 * and a genuine in-app journey looks like a cold open. And it must not step
 * back into the page it is already on — jump links (`#Files`) and query
 * changes (`?tab=Money`) each push a history entry, so after a couple of
 * those, "back" would just walk through the same page.
 */
export default function BackLink({
  fallback,
  className,
  children,
}: {
  /** Where to go when there is nothing meaningful to go back to. */
  fallback: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Count navigations that actually left this page, so same-page hash and
  // query entries never make `back()` look useful.
  const enteredAt = useRef(pathname);
  const movedWithinApp = useRef(false);
  useEffect(() => {
    if (pathname !== enteredAt.current) movedWithinApp.current = true;
  }, [pathname]);

  return (
    <a
      href={fallback}
      className={className}
      onClick={(event) => {
        // Modified clicks (new tab, window) keep their native behaviour.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (movedWithinApp.current) router.back();
        else router.push(fallback);
      }}
    >
      {children}
    </a>
  );
}
