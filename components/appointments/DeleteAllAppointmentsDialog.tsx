"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function DeleteAllAppointmentsDialog({
  appointmentCount,
}: {
  appointmentCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function deleteAll() {
    try {
      setDeleting(true);
      const response = await fetch("/api/appointments", { method: "DELETE" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.error || "Could not archive appointments.");
      }

      toast.success(
        `${body.archivedCount} appointment${body.archivedCount === 1 ? "" : "s"} archived.`,
      );
      setOpen(false);
      router.push("/dashboard/appointments");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not archive appointments.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        disabled={appointmentCount === 0}
        onClick={() => setOpen(true)}
        className="min-h-11 gap-2 border-warning-border bg-card px-4 font-semibold text-warning shadow-sm hover:bg-warning-bg"
      >
        <Archive className="size-4" />
        Archive All
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive all appointments?</DialogTitle>
          <DialogDescription>
            This removes all {appointmentCount} appointments from the active list
            while preserving appointment history, patient profiles, and medical records.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={deleting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={deleting}
            onClick={deleteAll}
            className="border border-danger-border bg-card text-danger hover:bg-danger-bg"
          >
            {deleting ? "Archiving..." : "Archive All"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
