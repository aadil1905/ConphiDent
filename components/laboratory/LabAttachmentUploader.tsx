"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function LabAttachmentUploader({ caseId, portalToken }: { caseId: number; portalToken?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      ref={formRef}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch(`/api/laboratory/cases/${caseId}/attachments`, {
            method: "POST",
            body: new FormData(event.currentTarget),
            headers: portalToken ? { Authorization: `LabPortal ${portalToken}` } : undefined,
          });
          const result = await response.json();
          setMessage(result.error || "Stored privately against this case.");
          if (response.ok) {
            formRef.current?.reset();
            router.refresh();
          }
        } catch {
          setMessage("That didn't finish uploading — your connection dropped. Try again.");
        } finally {
          setBusy(false);
        }
      }}
      className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
    >
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">File
        <input
          required
          name="file"
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.stl,.ply,.obj"
          className="min-h-11 w-full rounded-control border border-border bg-card p-2 text-sm font-normal text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-heading">What is it
        <select name="category" className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm font-normal text-foreground">
          <option value="DOCUMENT">Document</option>
          <option value="PHOTOGRAPH">Photograph</option>
          <option value="DESIGN_PREVIEW">Design preview</option>
          <option value="INTRAORAL_SCAN">3D scan</option>
          <option value="STAGE_EVIDENCE">Stage evidence</option>
        </select>
      </label>
      <button
        disabled={busy}
        className="min-h-11 cursor-pointer self-end rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Attach it"}
      </button>
      {message && (
        <p aria-live="polite" className="text-[length:var(--text-secondary)] text-text-muted sm:col-span-3">
          {message}
        </p>
      )}
    </form>
  );
}
