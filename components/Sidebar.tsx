"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  BellRing,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessagesSquare,
  PackageCheck,
  FlaskConical,
  ClipboardCheck,
  ReceiptIndianRupee,
  Settings,
  Stethoscope,
  Users,
  UserRoundPlus,
  Menu,
  X,
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";

const navigationGroups = [
  { label: "Workspace", items: [
    { href: "/dashboard", label: "Today", icon: LayoutDashboard },
    { href: "/dashboard/conversations", label: "Inbox", icon: MessagesSquare, feature: "whatsapp" },
    { href: "/dashboard/automation", label: "Automation", icon: Bot, feature: "whatsapp" },
    { href: "/dashboard/appointments", label: "Schedule", icon: CalendarDays, feature: "appointments" },
    { href: "/dashboard/huddle", label: "Today’s priorities", icon: ClipboardCheck },
    { href: "/dashboard/patients", label: "Patients", icon: Users, feature: "patients" },
  ] },
  { label: "Patient care & revenue", items: [
    { href: "/dashboard/clinical-workspace", label: "Clinical", icon: Stethoscope, feature: "clinical" },
    { href: "/dashboard/treatment-plans", label: "Treatment plans", icon: ClipboardList, feature: "clinical" },
    { href: "/dashboard/billing", label: "Revenue", icon: ReceiptIndianRupee, feature: "billing" },
  ] },
  { label: "Manage", items: [
    { href: "/dashboard/leads", label: "Leads", icon: UserRoundPlus, feature: "crm" },
    { href: "/dashboard/follow-ups", label: "Work queue", icon: BellRing, feature: "follow_ups" },
    { href: "/dashboard/laboratory", label: "Laboratory", icon: FlaskConical, feature: "laboratory" },
    { href: "/dashboard/operations", label: "Operations", icon: PackageCheck, feature: "inventory" },
    { href: "/dashboard/analytics", label: "Reports", icon: BarChart3, feature: "reports" },
  ] },
];

export default function Sidebar({ role, clinicName, logoUrl, features }: { role: string; clinicName: string; logoUrl?: string | null; features: Record<FeatureKey, boolean> }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const prefetchTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    };
  }, []);

  const prefetchOnIntent = (href: string) => {
    if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => router.prefetch(href), 70);
  };

  const cancelPrefetch = () => {
    if (prefetchTimer.current) {
      window.clearTimeout(prefetchTimer.current);
      prefetchTimer.current = null;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-[70] inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white/95 text-[var(--heading)] shadow-lg shadow-[#123b5d]/10 backdrop-blur transition hover:bg-[var(--surface-muted)]"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-[75] bg-[#123b5d]/35 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[80] flex h-screen w-[min(88vw,320px)] shrink-0 flex-col border-r border-border bg-white shadow-2xl shadow-[#123b5d]/20 transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >

      {/* =================== HEADER =================== */}

      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3">

          {logoUrl?.startsWith("/") ? <div className="h-14 w-14 overflow-hidden rounded-xl border border-border bg-white p-1"><Image src={logoUrl} alt={`${clinicName} logo`} width={56} height={56} className="h-full w-full object-contain" /></div> : <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary text-xl font-black text-white">{clinicName.slice(0, 1).toUpperCase()}</div>}

          <div className="leading-tight">

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">CLINIC WORKSPACE</p>
            <h2 className="max-w-[190px] truncate text-xl font-black tracking-tight text-[var(--heading)]">{clinicName}</h2>

          </div>

        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-border text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)]"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* =================== NAVIGATION =================== */}

      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {navigationGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{group.label}</p>
            {group.items.filter((item) => !item.feature || features[item.feature as FeatureKey]).map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === href
              : pathname.startsWith(href);

              return (
            <Link
              key={href}
              href={href}
              prefetch={null}
              onMouseEnter={() => prefetchOnIntent(href)}
              onMouseLeave={cancelPrefetch}
              onFocus={() => router.prefetch(href)}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                active
                  ? "bg-[var(--primary-soft)] text-primary shadow-sm ring-1 ring-[var(--border)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--heading)]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* =================== FOOTER =================== */}

      <div className="border-t border-border p-4">

        {role === "OWNER" && (
          <Link
            href="/dashboard/settings"
            prefetch={null}
            onMouseEnter={() => prefetchOnIntent("/dashboard/settings")}
            onMouseLeave={cancelPrefetch}
            onFocus={() => router.prefetch("/dashboard/settings")}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--heading)]"
          >
            <Settings className="h-5 w-5" />
            Clinic settings
          </Link>
        )}

        <div className="mt-4 rounded-xl bg-[var(--primary-soft)] p-3 text-center">
          <p className="text-xs font-semibold text-[var(--text-muted)]">
            PRIVATE CLINIC WORKSPACE
          </p>
        </div>

      </div>

      </aside>
    </>
  );
}
