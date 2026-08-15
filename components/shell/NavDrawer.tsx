"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { NAV_SETTINGS, isActiveHref, type NavCounts, type NavDestination } from "./nav-items";

type NavDrawerProps = {
  open: boolean;
  onClose: () => void;
  destinations: readonly NavDestination[];
  counts: NavCounts;
  clinicName: string;
  branch: string;
  logoUrl?: string | null;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The only navigation. Tab cycles inside it, Escape closes it, and
 * focus goes back to whatever opened it.
 */
export default function NavDrawer({
  open,
  onClose,
  destinations,
  counts,
  clinicName,
  branch,
  logoUrl,
}: NavDrawerProps) {
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="fixed inset-0 z-[70] cursor-default bg-[rgba(18,59,93,0.35)] backdrop-blur-[4px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="fixed inset-y-0 left-0 z-[80] flex w-[min(88vw,300px)] flex-col border-r border-border bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-3.5">
          {logoUrl ? (
            <div className="h-10 w-10 flex-none overflow-hidden rounded-control border border-border bg-white p-0.5">
              <Image src={logoUrl} alt="" width={40} height={40} unoptimized className="h-full w-full object-contain" />
            </div>
          ) : (
            <div className="grid h-10 w-10 flex-none place-items-center rounded-control bg-secondary text-[17px] font-bold text-heading">
              {clinicName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-heading">{clinicName}</div>
            <div className="truncate text-[11px] text-text-muted">{branch}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-11 w-11 flex-none place-items-center rounded-control text-heading transition-colors duration-150 hover:bg-muted"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2.5">
          {destinations.map((item) => {
            const active = isActiveHref(pathname, item.href);
            const count = item.badge ? counts[item.badge] ?? 0 : 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-control px-2.5 py-2.5 ${
                  active ? "bg-primary-soft font-semibold text-heading" : "text-foreground"
                }`}
              >
                <Icon className="h-[17px] w-[17px] flex-none" strokeWidth={1.9} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {count > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-[11px] font-bold tabular-nums text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-2 py-2.5">
          <Link
            href={NAV_SETTINGS.href}
            onClick={onClose}
            aria-current={isActiveHref(pathname, NAV_SETTINGS.href) ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-control px-2.5 py-2.5 ${
              isActiveHref(pathname, NAV_SETTINGS.href)
                ? "bg-primary-soft font-semibold text-heading"
                : "text-foreground"
            }`}
          >
            <NAV_SETTINGS.icon className="h-[17px] w-[17px] flex-none" strokeWidth={1.9} aria-hidden />
            <span>Settings</span>
          </Link>
        </div>
      </div>
    </>
  );
}
