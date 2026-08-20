"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  appointmentId: number;
};

export default function DeleteAppointmentDialog({ appointmentId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function archiveVisit() {
    try {
      setLoading(true);
      const response = await fetch(`/api/appointments/${appointmentId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      toast.success("Visit archived. The patient's records are untouched.");
      setOpen(false);
      router.push("/dashboard/appointments");
      router.refresh();
    } catch {
      toast.error("That didn't save — nothing changed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-danger-border bg-card px-4 text-[13px] font-semibold text-danger hover:bg-danger-bg disabled:opacity-70"
      >
        {loading ? "Archiving…" : "Archive this visit"}
      </button>
      <ConfirmDialog
        open={open}
        copy={{
          title: "Archive this visit?",
          body: "It leaves the schedule and the day's counts. The patient, their notes and their bills stay exactly as they are.",
          confirmLabel: "Archive it",
          keepLabel: "Keep it",
          tone: "danger",
        }}
        onConfirm={() => void archiveVisit()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
