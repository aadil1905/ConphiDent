"use client";

import Link from "next/link";
import { AlertTriangle, LayoutDashboard, RefreshCcw } from "lucide-react";

export default function PlatformError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="platform-error" role="alert">
    <div className="platform-error__icon"><AlertTriangle className="size-6" aria-hidden="true" /></div>
    <p className="platform-eyebrow">Control Center recovery</p>
    <h1>This view could not be loaded</h1>
    <p>Your session is still protected. Retry the request, or return to the overview and choose another operation.</p>
    <div className="platform-error__actions">
      <button type="button" onClick={reset} className="platform-button platform-button--primary"><RefreshCcw className="size-4" aria-hidden="true" />Retry</button>
      <Link href="/platform" className="platform-button platform-button--secondary"><LayoutDashboard className="size-4" aria-hidden="true" />Overview</Link>
    </div>
  </main>;
}
