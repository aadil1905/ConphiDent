"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * The brief goes to the team as text they paste into whichever group they
 * already use. The WhatsApp stack here only ever writes to a consented
 * patient, so there is no clinic group to send to from the server.
 */
export default function ShareBriefButton({ text }: { text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Brief copied. Paste it into your clinic group.");
    } catch {
      toast.error("Your browser wouldn't let us copy. Select the page and copy it by hand.");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold whitespace-nowrap text-white hover:bg-primary-hover"
    >
      <Share2 className="h-4 w-4" aria-hidden />
      Send to the team
    </button>
  );
}
