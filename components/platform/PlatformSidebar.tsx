"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/dashboard/account-actions";
import {
  Activity,
  Bell,
  Bot,
  Building2,
  CreditCard,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  ReceiptIndianRupee,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

const groups = [
  { label: "", items: [{ href: "/platform", label: "Overview", icon: LayoutDashboard, permission: "tenant.read" }] },
  { label: "Clinics", items: [{ href: "/platform/clinics", label: "Tenant directory", icon: Building2, permission: "tenant.read" }, { href: "/platform/clinics/new", label: "Provision clinic", icon: Plus, permission: "tenant.create" }, { href: "/platform/onboarding", label: "Onboarding pipeline", icon: Activity, permission: "onboarding.manage" }] },
  { label: "Communications", items: [{ href: "/platform/whatsapp", label: "WhatsApp", icon: MessageCircle, permission: "whatsapp.read" }, { href: "/platform/automations", label: "Automations", icon: Bot, permission: "whatsapp.manage" }, { href: "/platform/search", label: "Global search", icon: Search, permission: "tenant.read" }] },
  { label: "Operations", items: [{ href: "/platform/health", label: "Platform health", icon: Activity, permission: "deployment.read" }, { href: "/platform/notifications", label: "Alerts", icon: Bell, permission: "logs.read" }, { href: "/platform/operations", label: "Internal operations", icon: Settings, permission: "support.manage" }, { href: "/platform/support", label: "Support", icon: HeartPulse, permission: "support.manage" }] },
  { label: "Commercial", items: [{ href: "/platform/sales", label: "Sales pipeline", icon: ReceiptIndianRupee, permission: "onboarding.manage" }, { href: "/platform/billing", label: "Plans & subscriptions", icon: CreditCard, permission: "billing.read" }] },
  { label: "Insights", items: [{ href: "/platform/analytics", label: "Analytics", icon: Activity, permission: "analytics.read" }] },
  { label: "Governance", items: [{ href: "/platform/users", label: "Team & access", icon: Users, permission: "user.read" }, { href: "/platform/audit", label: "Audit log", icon: FileText, permission: "logs.read" }, { href: "/platform/infrastructure", label: "Infrastructure", icon: ShieldCheck, permission: "deployment.read" }] },
] as const;

export function PlatformSidebar({ fullName, role, permissions }: { fullName: string; role: string; permissions: readonly string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const prefetchTimer = useRef<number | null>(null);
  const permissionSet = new Set(permissions);
  const visibleGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => permissionSet.has(item.permission)) }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const prefetchOnIntent = (href: string) => {
    if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = window.setTimeout(() => router.prefetch(href), 70);
  };
  const cancelPrefetch = () => {
    if (prefetchTimer.current) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };

  return <>
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="platform-menu-toggle"
      aria-label="Open Control Center navigation"
      aria-expanded={open}
      aria-controls="platform-navigation"
    >
      <Menu className="size-5" aria-hidden="true" />
    </button>
    {open && <button type="button" aria-label="Close Control Center navigation" className="platform-nav-overlay" onClick={() => setOpen(false)} />}
    <aside
      id="platform-navigation"
      className={`platform-sidebar ${open ? "platform-sidebar--open" : ""}`}
      aria-label="Control Center navigation"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="platform-sidebar__brand">
        <Link href="/platform" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary text-xl font-black text-white shadow-sm">C</span>
          <span className="platform-sidebar__brand-copy">
            <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-primary">Enterprise control</span>
            <span className="block max-w-[190px] truncate text-xl font-black tracking-tight text-[var(--heading)]">ConphiDent Technologies</span>
          </span>
        </Link>
        <button type="button" onClick={() => setOpen(false)} className="platform-sidebar__close" aria-label="Close Control Center navigation"><X className="size-5" aria-hidden="true" /></button>
      </div>
      <nav className="platform-sidebar__nav" aria-label="Platform destinations">
        {visibleGroups.map((group) => <section key={group.label || "root"} className="platform-sidebar__group">
          {group.label && <p>{group.label}</p>}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/platform" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return <Link
              key={`${group.label}-${label}`}
              href={href}
              prefetch={null}
              onMouseEnter={() => prefetchOnIntent(href)}
              onMouseLeave={cancelPrefetch}
              onFocus={() => router.prefetch(href)}
              onClick={() => setOpen(false)}
              className={active ? "is-active" : ""}
              aria-current={active ? "page" : undefined}
            ><Icon className="size-5 shrink-0" aria-hidden="true" /><span>{label}</span></Link>;
          })}
        </section>)}
      </nav>
      <div className="platform-sidebar__footer">
        <div className="platform-sidebar__operator"><p>{fullName}</p><span>{role.replaceAll("_", " ")}</span></div>
        <form action={logoutAction}><button type="submit"><LogOut className="size-5" aria-hidden="true" /><span>Sign out</span></button></form>
        <p className="platform-sidebar__privacy">Private Control Center</p>
      </div>
    </aside>
  </>;
}
