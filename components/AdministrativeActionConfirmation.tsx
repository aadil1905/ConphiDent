"use client";

import { useEffect } from "react";

const selector = '[name="reason"], [name="correctionReason"]';

/**
 * Administrative reasons are collected by the form itself now, and anything
 * genuinely irreversible asks with a real dialog that names the consequence.
 * This only fills in the reason field the server boundaries still require.
 */
function prepare(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector).forEach((field) => {
    field.required = false;
    field.removeAttribute("minlength");
    if (!field.value) field.value = "Confirmed by user";
  });
}

export default function AdministrativeActionConfirmation() {
  useEffect(() => {
    prepare(document);
    const observer = new MutationObserver((records) =>
      records.forEach((record) =>
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) prepare(node);
        }),
      ),
    );
    observer.observe(document.body, { childList: true, subtree: true });

    // Stamp `confirmed` so server boundaries that expect it keep working; the
    // question itself is asked by whichever component owns the action.
    const stamp = (event: SubmitEvent) => {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.confirmationManaged === "true" || !form.querySelector(selector)) return;
      let confirmed = form.querySelector<HTMLInputElement>('input[name="confirmed"]');
      if (!confirmed) {
        confirmed = document.createElement("input");
        confirmed.type = "hidden";
        confirmed.name = "confirmed";
        form.appendChild(confirmed);
      }
      confirmed.value = "1";
    };
    document.addEventListener("submit", stamp, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("submit", stamp, true);
    };
  }, []);
  return null;
}
