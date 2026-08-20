"use client";

import { useRef, useState } from "react";
import { ConfirmDialog, type ConfirmCopy } from "./confirm-dialog";

/**
 * Guards a form submit with a real dialog that names the consequence, and
 * stamps the `confirmed` field the server boundaries look for. Replaces the
 * `window.confirm()` guards Phase B deleted.
 */
export function useConfirmSubmit(copy: ConfirmCopy) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);

  const guard = (event: React.FormEvent<HTMLFormElement>) => {
    const target = event.currentTarget;
    if (target.dataset.confirmed === "1") {
      delete target.dataset.confirmed;
      return;
    }
    event.preventDefault();
    form.current = target;
    setOpen(true);
  };

  const cancel = () => {
    form.current = null;
    setOpen(false);
  };

  const confirm = () => {
    const target = form.current;
    setOpen(false);
    form.current = null;
    if (!target) return;
    if (!target.querySelector('input[name="confirmed"]')) {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "confirmed";
      field.value = "1";
      target.appendChild(field);
    }
    target.dataset.confirmed = "1";
    target.requestSubmit();
  };

  const dialog = <ConfirmDialog open={open} copy={copy} onConfirm={confirm} onCancel={cancel} />;

  return { guard, dialog };
}
