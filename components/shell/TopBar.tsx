"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Menu, Search } from "lucide-react";
import { logoutAction } from "@/app/dashboard/account-actions";

export type ShellAlert = {
  label: string;
  detail: string;
  href: string;
  tone?: "danger" | "warning" | "info";
};

type TopBarProps = {
  freshness: string;
  paletteHint: string;
  alerts: ShellAlert[];
  user: { fullName: string; role: string; clinicName: string };
  clinicName: string;
  branch: string;
  onOpenDrawer: () => void;
  onOpenPalette: () => void;
};

const TONE_DOT: Record<NonNullable<ShellAlert["tone"]>, string> = {
  danger: "bg-danger-mark",
  warning: "bg-warning",
  info: "bg-primary",
};

function useDismissOnOutside(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDismiss]);
  return ref;
}

export default function TopBar({
  freshness,
  paletteHint,
  alerts,
  user,
  clinicName,
  branch,
  onOpenDrawer,
  onOpenPalette,
}: TopBarProps) {
  const [bellOpen, setBellOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  const bellRef = useDismissOnOutside(() => setBellOpen(false));
  const avatarRef = useDismissOnOutside(() => setAvatarOpen(false));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBellOpen(false);
        setAvatarOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const initials =
    user.fullName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-40 flex min-h-16 flex-wrap items-center gap-3 border-b border-border bg-[var(--topbar-bg)] px-[clamp(1rem,1.5vw,2rem)] py-2.5 backdrop-blur-xl print:hidden">
      {/* The one way into navigation, at every width, always in the same place. */}
      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="Open navigation"
        title="Open navigation"
        className="grid h-12 w-12 flex-none cursor-pointer place-items-center rounded-control border border-border bg-card text-heading shadow-[var(--shadow)] transition-colors duration-150 hover:bg-muted"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/* Which clinic, which branch. The greeting and the "updated 3 minutes
          ago" clock used to share this line: three unrelated facts in one
          muted string, and the only one you can act on mid-shift is the
          branch — it is what tells you whose day you are looking at. The
          freshness still has a home, on the notification panel it describes. */}
      <div className="min-w-0 flex-[1_1_200px]">
        <p className="truncate text-[length:var(--text-body)] font-semibold text-heading">{clinicName}</p>
        <p className="truncate text-xs text-text-muted">{branch}</p>
      </div>

      <button
        type="button"
        onClick={onOpenPalette}
        className="flex min-h-11 flex-[1_1_220px] cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-3 text-left text-[length:var(--text-secondary)] text-text-muted transition-colors duration-150 hover:border-border-strong sm:max-w-[420px]"
      >
        <Search className="h-[15px] w-[15px] flex-none" aria-hidden />
        <span className="flex-1 truncate">Search or jump to anything</span>
        <kbd className="flex-none rounded-chip border border-border bg-muted px-1.5 py-0.5 text-[length:var(--text-micro)] font-semibold whitespace-nowrap text-text-muted">
          {paletteHint}
        </kbd>
      </button>

      {/* ml-auto keeps this cluster on the right even when the header wraps
          to two rows on a phone — without it the account menu, anchored
          right-0 to its button, opened 49px past the left screen edge. */}
      <div className="ml-auto flex flex-none items-center gap-2">
        <Link
          href="/dashboard/appointments/new"
          className="inline-flex min-h-11 items-center rounded-control bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold whitespace-nowrap text-primary-foreground transition-colors duration-150 hover:bg-primary-hover"
        >
          Book
        </Link>

        <div className="relative" ref={bellRef}>
          <button
            type="button"
            onClick={() => {
              setBellOpen((open) => !open);
              setAvatarOpen(false);
            }}
            aria-label={alerts.length ? `Notifications, ${alerts.length} need you` : "Notifications"}
            aria-expanded={bellOpen}
            className="relative grid h-11 w-11 cursor-pointer place-items-center rounded-control border border-border bg-card text-heading transition-colors duration-150 hover:bg-muted"
          >
            <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger-mark px-1 text-[10px] font-bold text-white">
                {alerts.length > 9 ? "9+" : alerts.length}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] max-h-[min(70vh,480px)] w-[340px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card border border-border bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
              <div className="flex items-baseline justify-between border-b border-border px-3.5 py-2.5">
                <span className="text-[length:var(--text-secondary)] font-semibold text-heading">Needs you</span>
                <span className="text-[length:var(--text-micro)] text-text-muted">{freshness}</span>
              </div>
              {alerts.length === 0 ? (
                <p className="px-3.5 py-5 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  Nothing needs you right now. Nice.
                </p>
              ) : (
                alerts.map((alert) => (
                  <Link
                    key={`${alert.href}-${alert.label}`}
                    href={alert.href}
                    onClick={() => setBellOpen(false)}
                    className="flex gap-2.5 border-b border-border px-3.5 py-2.5 text-foreground last:border-b-0 hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 flex-none rounded-pill ${TONE_DOT[alert.tone ?? "info"]}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-heading">{alert.label}</span>
                      <span className="block text-xs text-text-muted">{alert.detail}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={avatarRef}>
          <button
            type="button"
            onClick={() => {
              setAvatarOpen((open) => !open);
              setBellOpen(false);
            }}
            aria-label="Your account"
            aria-expanded={avatarOpen}
            className="flex h-11 cursor-pointer items-center gap-1.5 rounded-pill border border-border bg-card py-0 pr-2 pl-1 text-heading transition-colors duration-150 hover:bg-muted"
          >
            <span className="grid h-8 w-8 place-items-center rounded-pill bg-secondary text-xs font-bold text-heading">
              {initials}
            </span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] max-h-[min(70vh,480px)] w-[250px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-card border border-border bg-card shadow-[var(--shadow-overlay)] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150">
              <div className="border-b border-border px-3.5 py-3">
                <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] font-semibold text-heading">{user.fullName}</p>
                <p className="text-xs text-text-muted">
                  {user.role.charAt(0) + user.role.slice(1).toLowerCase()} · {user.clinicName}
                </p>
              </div>
              <Link
                href="/dashboard/settings"
                onClick={() => setAvatarOpen(false)}
                className="block min-h-11 px-3.5 py-2.5 text-foreground hover:bg-muted"
              >
                Your profile
              </Link>
              <Link
                href="/dashboard/settings"
                onClick={() => setAvatarOpen(false)}
                className="block min-h-11 border-t border-border px-3.5 py-2.5 text-foreground hover:bg-muted"
              >
                Clinic settings
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="block min-h-11 w-full cursor-pointer border-t border-border px-3.5 py-2.5 text-left text-foreground hover:bg-muted"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
