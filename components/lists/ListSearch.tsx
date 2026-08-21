"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

const DEBOUNCE_MS = 250;

/**
 * Live search that writes to the URL after 250ms, so the address bar always
 * describes what is on screen and the back button undoes a search.
 */
export default function ListSearch({
  placeholder,
  label = "Search this list",
}: {
  placeholder: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<number | null>(null);
  const [value, setValue] = useState(() => searchParams.get("q") ?? "");

  const push = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    // A new search always starts at the first page.
    params.delete("page");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => push(next), DEBOUNCE_MS);
  };

  const clear = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setValue("");
    push("");
  };

  return (
    <div className="relative flex min-w-0 flex-[1_1_240px] items-center">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-control border border-input bg-card pr-10 pl-9 text-sm text-foreground placeholder:text-text-muted"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear the search"
          className="absolute right-1 grid h-9 w-9 cursor-pointer place-items-center rounded-chip text-text-muted hover:bg-muted"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
