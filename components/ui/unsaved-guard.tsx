"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Nothing in this product used to guard a half-filled form. A clinical note
 * typed between two patients, an invoice with nine lines on it — one stray tap
 * on the drawer and it was gone, with no way back.
 *
 * Two exits have to be covered, and only one of them is the obvious one:
 *
 *  - Closing the tab or hitting reload. `beforeunload` handles this, and the
 *    browser draws its own dialog; we cannot word it.
 *  - Clicking a link. This is the one that actually happens, and `beforeunload`
 *    never fires for it — the drawer, the top bar and every row in a list are
 *    client-side routes. So the guard also watches clicks in the capture phase
 *    and stops the navigation before React's handler runs, which is why the
 *    drawer does not close out from under the question.
 *
 * A form is dirty from the first keystroke, not from a value comparison: the
 * six forms this wraps mix uncontrolled `defaultValue` inputs, `useState`
 * arrays and react-hook-form, and there is no single snapshot to diff against.
 * Typing and then undoing counts as dirty. That is the safe direction to err.
 *
 * Call `release()` immediately before the redirect on a successful save,
 * otherwise the form's own `router.push` trips the guard.
 */
export function useUnsavedGuard() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const release = useCallback(() => {
    dirty.current = false;
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const markDirty = () => {
      dirty.current = true;
    };
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      // Safari and older Chrome still want this assigned to show the prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const onClick = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented) return;
      // A modified click opens elsewhere and leaves this page alone.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // Links inside the form are its own tools — "add another medicine",
      // "look this patient up" — not a way out of it.
      if (!anchor || form.contains(anchor) || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;

      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(`${next.pathname}${next.search}${next.hash}`);
    };
    document.addEventListener("click", onClick, true);

    return () => {
      form.removeEventListener("input", markDirty);
      form.removeEventListener("change", markDirty);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const dialog = (
    <ConfirmDialog
      open={pendingHref !== null}
      copy={{
        title: "Leave this without saving?",
        body: "Nothing here has been saved yet. Go and it is gone — there is no draft to come back to.",
        confirmLabel: "Leave and lose it",
        keepLabel: "Stay here",
      }}
      onConfirm={() => {
        const href = pendingHref;
        dirty.current = false;
        setPendingHref(null);
        if (href) router.push(href);
      }}
      onCancel={() => setPendingHref(null)}
    />
  );

  return { formRef, release, dialog };
}
