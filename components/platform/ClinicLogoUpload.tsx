"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"]);

export function ClinicLogoUpload({ clinicId, currentLogoUrl, clinicName }: { clinicId: number; currentLogoUrl: string | null; clinicName: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState(currentLogoUrl);
  const [state, setState] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!TYPES.has(file.type) || file.size > MAX_BYTES) {
      setState({ type: "error", message: "Choose a PNG, JPEG, WebP, SVG, or icon smaller than 2 MB." });
      return;
    }
    setState({ type: "loading", message: "Uploading logo…" });
    const body = new FormData(); body.set("file", file); body.set("kind", "LOGO");
    try {
      const response = await fetch(`/api/platform/clinics/${clinicId}/media`, { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "The logo could not be uploaded.");
      setPreview(result.url); setState({ type: "success", message: "Logo updated. Branding has been refreshed." });
      router.refresh();
    } catch (error) {
      setState({ type: "error", message: error instanceof Error ? error.message : "The logo could not be uploaded." });
    }
  }

  return <div className="rounded-xl border bg-muted/20 p-4 sm:col-span-2">
    <div className="flex items-center gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-background text-lg font-bold text-slate-500">
        {preview ? <Image src={preview} alt={`${clinicName} logo`} width={64} height={64} className="size-full object-contain" unoptimized /> : clinicName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0"><p className="text-sm font-semibold">Clinic logo</p><p className="text-xs text-muted-foreground">PNG, JPEG, WebP, SVG, or icon. Maximum 2 MB.</p>
        <label className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-lg border bg-background px-3 text-sm font-semibold hover:bg-muted">
          {state.type === "loading" ? "Uploading…" : "Choose logo"}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon" onChange={upload} disabled={state.type === "loading"} />
        </label>
      </div>
    </div>
    {state.type !== "idle" && <p role={state.type === "error" ? "alert" : "status"} className={`mt-3 text-sm ${state.type === "error" ? "text-red-700" : state.type === "success" ? "text-emerald-700" : "text-muted-foreground"}`}>{state.message}</p>}
  </div>;
}
