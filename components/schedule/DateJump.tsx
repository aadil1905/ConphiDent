"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Jump straight to a date. The arrows beside this walk one day or week at a
 * time, which made "three weeks from now" twenty-one clicks — the URL has
 * carried ?date= since the page was written, this is just the control for it.
 *
 * Mount with key={value} so navigating by the arrows re-seeds the input.
 */
export default function DateJump({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const go = (next: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", next);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <input
      type="date"
      defaultValue={value}
      onChange={(event) => go(event.target.value)}
      aria-label="Jump to a date"
      className="min-h-11 cursor-pointer rounded-control border border-input bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading"
    />
  );
}
