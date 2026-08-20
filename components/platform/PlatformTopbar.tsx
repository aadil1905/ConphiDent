"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, CircleDot, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlatformCommandSearch } from "@/components/platform/PlatformCommandSearch";

const labels: Record<string, string> = {
  analytics: "Analytics",
  audit: "Audit log",
  automations: "Automations",
  billing: "Plans & subscriptions",
  clinics: "Clinics",
  health: "Platform health",
  infrastructure: "Infrastructure",
  new: "Provision clinic",
  notifications: "Alerts",
  onboarding: "Onboarding pipeline",
  operations: "Internal operations",
  organizations: "Tenant directory",
  sales: "Sales pipeline",
  search: "Global search",
  support: "Support",
  users: "Team & access",
  whatsapp: "WhatsApp",
};

export function PlatformTopbar({ fullName, role, environment, permissions }: { fullName: string; role: string; environment: string; permissions: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const permissionSet = new Set(permissions);
  const crumbs = pathname
    .split("/")
    .filter(Boolean)
    .slice(1)
    .map((part) => labels[part] || (/^\d+$/.test(part) ? "Clinic 360°" : part.replaceAll("-", " ")));
  const initials = fullName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return <header className="platform-topbar">
    <div className="platform-topbar__context">
      <p>{crumbs.join(" / ") || "Overview"}</p>
      <span>ConphiDent Technologies</span>
    </div>
    <div className="platform-topbar__search"><PlatformCommandSearch /></div>
    <div className="platform-topbar__actions">
      <span className="platform-topbar__status"><CircleDot className="size-3.5" aria-hidden="true" />{environment}</span>
      {permissionSet.has("logs.read") && <Link href="/platform/notifications" className="platform-topbar__icon" aria-label="Open platform alerts"><Bell className="size-[18px]" aria-hidden="true" /></Link>}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="platform-topbar__account"
          aria-expanded={open}
          aria-controls="platform-account-menu"
          aria-haspopup="menu"
        >
          <span className="platform-topbar__avatar">{initials}</span>
          <span className="platform-topbar__identity"><b>{fullName}</b><small>{role.replaceAll("_", " ")}</small></span>
          <ChevronDown className={`size-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {open && <div id="platform-account-menu" className="platform-topbar__menu" role="menu">
          <p>Platform account</p>
          {permissionSet.has("user.read") ? <Link href="/platform/users" onClick={() => setOpen(false)} role="menuitem"><Settings className="size-4" aria-hidden="true" />Access & permissions</Link> : <span className="platform-topbar__menu-note">Your platform role controls available tools.</span>}
        </div>}
      </div>
    </div>
  </header>;
}
