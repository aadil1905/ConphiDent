"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES } from "@/lib/list-params";

/** How many rows at a time — remembered in the URL like every other filter. */
export default function PageSize({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const change = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("size", next);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      Rows
      <select
        value={String(value)}
        onChange={(event) => change(event.target.value)}
        className="min-h-11 rounded-control border border-border-strong bg-card px-2 text-[length:var(--text-secondary)] text-foreground"
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
