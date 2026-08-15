import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-control border border-border bg-card px-3 py-2 text-sm leading-5 text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-text-muted focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-danger-border aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_srgb,var(--danger),transparent_78%)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
