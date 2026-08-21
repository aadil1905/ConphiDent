import Link from "next/link";
import { Archive, Copy, FileClock, RotateCcw, Trash2 } from "lucide-react";
import {
  archiveClinicProvisioningDraftAction,
  discardClinicProvisioningDraftAction,
  duplicateClinicProvisioningDraftAction,
  restoreClinicProvisioningDraftAction,
} from "@/app/platform/actions";
import {
  PlatformState,
  PlatformStatus,
} from "@/components/platform/PlatformPrimitives";
import { DraftMutationButton } from "@/components/platform/DraftMutationButton";

export type ProvisioningDraftSummary = {
  id: string;
  name: string;
  updatedAt: string;
  percent: number;
  status: "ACTIVE" | "ARCHIVED" | "DISCARDED" | "ACTIVATING";
};

export function ProvisioningDraftDashboard({
  drafts,
}: {
  drafts: ProvisioningDraftSummary[];
}) {
  const active = drafts.filter((draft) => draft.status === "ACTIVE");
  const inactive = drafts.filter(
    (draft) => draft.status === "ARCHIVED" || draft.status === "DISCARDED",
  );
  return (
    <section className="platform-card">
      <header className="platform-card__header">
        <div className="flex items-center gap-2">
          <FileClock className="size-4 text-primary" />
          <h2>Provisioning drafts</h2>
        </div>
        <p>
          Resume safely saved non-secret configuration or manage a recoverable
          draft.
        </p>
      </header>
      <div className="platform-card__content">
        {active.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {active.map((draft) => (
              <article key={draft.id} className="rounded-xl border p-4">
                <DraftIdentity draft={draft} />
                <div
                  role="progressbar"
                  aria-label={`${draft.name} draft completion`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={draft.percent}
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${draft.percent}%` }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/platform/clinics/new?draft=${encodeURIComponent(draft.id)}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                  >
                    <RotateCcw className="size-3.5" />
                    Resume
                  </Link>
                  <form action={duplicateClinicProvisioningDraftAction}>
                    <input type="hidden" name="draftId" value={draft.id} />
                    <DraftMutationButton
                      pendingLabel="Duplicating…"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      <Copy className="size-3.5" />
                      Duplicate
                    </DraftMutationButton>
                  </form>
                  <form action={archiveClinicProvisioningDraftAction}>
                    <input type="hidden" name="draftId" value={draft.id} />
                    <DraftMutationButton
                      pendingLabel="Archiving…"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      <Archive className="size-3.5" />
                      Archive
                    </DraftMutationButton>
                  </form>
                  <details className="w-full rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-[var(--danger)]">
                      <Trash2 className="size-3.5" />
                      Discard draft
                    </summary>
                    <form
                      action={discardClinicProvisioningDraftAction}
                      className="mt-3 grid gap-2"
                    >
                      <input type="hidden" name="draftId" value={draft.id} />
                      <label className="text-xs font-semibold text-[var(--danger)]">
                        Type DISCARD
                        <input
                          required
                          pattern="DISCARD"
                          name="confirmation"
                          autoComplete="off"
                          className="mt-1 block w-full rounded-lg border bg-card px-3 py-2 font-normal"
                        />
                      </label>
                      <DraftMutationButton
                        pendingLabel="Discarding…"
                        className="w-fit rounded-lg bg-[var(--danger)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Discard recoverably
                      </DraftMutationButton>
                    </form>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <PlatformState
            title="No active drafts"
            description="Start the wizard below. Non-secret configuration will appear here after the first save."
          />
        )}
        {inactive.length > 0 && (
          <details className="mt-4 rounded-xl border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--heading)]">
              Archived and discarded drafts ({inactive.length})
            </summary>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {inactive.map((draft) => (
                <article
                  key={draft.id}
                  className="rounded-lg border bg-card p-3"
                >
                  <DraftIdentity draft={draft} />
                  <form
                    action={restoreClinicProvisioningDraftAction}
                    className="mt-3"
                  >
                    <input type="hidden" name="draftId" value={draft.id} />
                    <DraftMutationButton
                      pendingLabel="Restoring…"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      <RotateCcw className="size-3.5" />
                      Restore draft
                    </DraftMutationButton>
                  </form>
                </article>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function DraftIdentity({ draft }: { draft: ProvisioningDraftSummary }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-[var(--heading)]">{draft.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Saved{" "}
          {new Date(draft.updatedAt).toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>
      <PlatformStatus
        tone={
          draft.status === "DISCARDED"
            ? "danger"
            : draft.status === "ARCHIVED"
              ? "neutral"
              : draft.percent === 100
                ? "success"
                : "info"
        }
      >
        {draft.status === "ACTIVE" ? `${draft.percent}%` : draft.status}
      </PlatformStatus>
    </div>
  );
}
