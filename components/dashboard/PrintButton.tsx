"use client";

import { Printer } from "lucide-react";

export default function PrintButton({
  label = "Print this",
  tone = "primary",
}: {
  label?: string
  tone?: "primary" | "outline"
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap ${
        tone === "outline"
          ? "border-border-strong bg-card text-heading hover:bg-muted"
          : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
      }`}
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
