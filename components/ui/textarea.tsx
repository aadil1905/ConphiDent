import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-control border border-border bg-card px-3 py-2 text-sm leading-6 text-foreground transition-colors outline-none placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_srgb,var(--danger),transparent_78%)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
