"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";

export default function PatientTableActions({
  patientId,
  patientName,
}: {
  patientId: number;
  patientName?: string;
}) {
  const router = useRouter();
  const gate = useConfirm();
  const who = patientName || "This patient";

  async function archive() {
    const response = await fetch(`/api/patients/${patientId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    if (!response.ok) {
      toast.error("That didn't save — your connection dropped. Nothing was lost; try again.");
      return;
    }
    toast.success(`${who} is off the active list. Their notes and bills are all still there.`);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2">
      <Link
        href={`/dashboard/patients/${patientId}`}
        className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
      >
        Open
      </Link>
      <Link
        href={`/dashboard/patients/${patientId}/edit`}
        className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={() => gate.ask(() => void archive())}
        className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-danger-border bg-danger-bg px-3.5 text-[length:var(--text-secondary)] font-semibold text-danger hover:brightness-95"
      >
        Take off the list
      </button>
      <ConfirmDialog
        open={gate.open}
        copy={{
          title: `Take ${who} off the active list?`,
          body: "They stop showing up in searches and lists. Every note, X-ray and bill stays exactly where it is, and you can put them back.",
          confirmLabel: "Take them off",
        }}
        onConfirm={gate.confirm}
        onCancel={gate.cancel}
      />
    </div>
  );
}
