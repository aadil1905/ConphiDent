"use client";

import { useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function WhatsAppConsentSubmitButton({ label = "Send on WhatsApp" }: { label?: string }) {
  const [asking, setAsking] = useState(false);
  const form = useRef<HTMLFormElement | null>(null);

  const send = () => {
    const target = form.current;
    setAsking(false);
    form.current = null;
    target?.requestSubmit();
  };

  return (
    <>
      <button
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          form.current = event.currentTarget.form;
          setAsking(true);
        }}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
      >
        <MessageCircle className="size-4" aria-hidden />
        {label}
      </button>
      <ConfirmDialog
        open={asking}
        copy={{
          title: "Send this on WhatsApp?",
          body: "Only send it if the patient told you it is fine to message this number about their care.",
          confirmLabel: "Send it",
          keepLabel: "Not now",
          tone: "primary",
        }}
        onConfirm={send}
        onCancel={() => {
          form.current = null;
          setAsking(false);
        }}
      />
    </>
  );
}
