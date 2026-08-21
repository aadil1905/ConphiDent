"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A one-of-many narrowing control that writes straight to the URL, so it
 * behaves like every other filter in the workspace: shareable, bookmarkable,
 * and undone by the back button.
 */
export default function FilterSelect({
  name,
  label,
  options,
  value,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const change = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(name, next);
    else params.delete(name);
    // A narrower list always starts at the first page.
    params.delete("page");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => change(event.target.value)}
        className="min-h-11 rounded-control border border-border-strong bg-card px-2.5 text-[length:var(--text-secondary)] text-foreground"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
