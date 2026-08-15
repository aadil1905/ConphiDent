"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NavDrawer from "./NavDrawer";
import TopBar, { type ShellAlert } from "./TopBar";
import CommandPalette from "./CommandPalette";
import { useClientValue } from "./use-client-value";
import { destinationsFor, type NavCounts } from "./nav-items";

const POLL_MS = 30_000;
const AGE_TICK_MS = 10_000;

type AppShellProps = {
  /** Hrefs this person may see. Icons are resolved on the client — they are
   *  React components and cannot cross the server boundary. */
  navHrefs: readonly string[];
  counts: NavCounts;
  alerts: ShellAlert[];
  clinicName: string;
  branch: string;
  logoUrl?: string | null;
  user: { fullName: string; role: string };
  children: React.ReactNode;
};

function freshnessLabel(seconds: number) {
  if (seconds < 60) return "Updated just now";
  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
}

function partOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const readIsMac = () => /Mac|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Navigation is a drawer at every width, opened from the button in the top
 * left. The clinic asked for this over Phase B's docked rail: the page keeps
 * its full width, and the nav is there the moment you want it.
 */
export default function AppShell({
  navHrefs,
  counts,
  alerts,
  clinicName,
  branch,
  logoUrl,
  user,
  children,
}: AppShellProps) {
  const router = useRouter();
  const destinations = destinationsFor(navHrefs);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [ageSeconds, setAgeSeconds] = useState(0);

  const onMac = useClientValue(readIsMac, false);
  const greeting = useClientValue(partOfDay, "Hello");
  const firstName = user.fullName.split(" ")[0];

  // Liveness: the inbox, the notification count and the Today queue stay honest
  // without anyone reaching for refresh.
  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setAgeSeconds(0);
      router.refresh();
    }, POLL_MS);
    const age = window.setInterval(
      () => setAgeSeconds((value) => value + AGE_TICK_MS / 1000),
      AGE_TICK_MS,
    );
    return () => {
      window.clearInterval(poll);
      window.clearInterval(age);
    };
  }, [router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destinations={destinations}
        counts={counts}
        clinicName={clinicName}
        branch={branch}
        logoUrl={logoUrl}
      />

      <TopBar
        greeting={`${greeting}, ${firstName}`}
        freshness={freshnessLabel(ageSeconds)}
        paletteHint={onMac ? "⌘K" : "Ctrl K"}
        alerts={alerts}
        user={{ ...user, clinicName }}
        clinicName={clinicName}
        branch={branch}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main className="flex flex-1 flex-col py-[clamp(1rem,1.5vw,2rem)]">
        <div className="mx-auto w-full min-w-0 max-w-[107.5rem] px-[clamp(1rem,1.5vw,2rem)]">
          {children}
        </div>
      </main>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
