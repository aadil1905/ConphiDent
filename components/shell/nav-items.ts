import {
  Activity,
  BarChart3,
  CalendarDays,
  FlaskConical,
  Home,
  IndianRupee,
  MessagesSquare,
  PackageCheck,
  Scan,
  Settings,
  Sprout,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FeatureKey } from "@/lib/features";
import type { Permission } from "@/lib/permissions";

/** Which live count, if any, rides on a destination. */
export type NavBadgeKey = "today" | "messages" | "growth" | "laboratory" | "imaging";

/**
 * A screen that belongs under a destination rather than beside it. Phase B cut
 * the nav to eleven entries, which left real screens — treatment plans,
 * prescriptions, the notes archive — reachable only by first landing somewhere
 * else and spotting a link. These put them back one click away.
 */
export type NavChild = {
  href: string;
  label: string;
  feature?: FeatureKey;
  permission?: Permission;
};

export type NavDestination = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Longer hint shown in the collapsed rail tooltip and the drawer. */
  hint: string;
  feature?: FeatureKey;
  permission?: Permission;
  badge?: NavBadgeKey;
  /** Never repeats the parent — these are the extra screens under it. */
  children?: readonly NavChild[];
};

/**
 * The eleven destinations, in the order Phase B fixed them, each with the
 * screens that live under it. Labels name the page they open — no more
 * "Reports" opening /analytics.
 *
 * Every entry carries the same feature and permission gate as the page it
 * opens, so the nav never offers a door that bounces you back to Today.
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    href: "/dashboard", label: "Today", icon: Home, hint: "What needs you right now", badge: "today",
    children: [
      { href: "/dashboard/huddle", label: "Huddle brief", permission: "manageSchedule" },
    ],
  },
  {
    href: "/dashboard/appointments", label: "Schedule", icon: CalendarDays, hint: "The diary, day and week", feature: "appointments", permission: "manageSchedule",
    children: [
      { href: "/dashboard/appointments/new", label: "Book a visit", feature: "appointments", permission: "manageSchedule" },
    ],
  },
  {
    href: "/dashboard/patients", label: "Patients", icon: Users, hint: "Everyone on your list", feature: "patients", permission: "managePatients",
    children: [
      { href: "/dashboard/patient-intake", label: "Intake links", feature: "patients", permission: "managePatients" },
    ],
  },
  {
    href: "/dashboard/clinical-workspace", label: "Clinical", icon: Activity, hint: "Charting, notes and prescriptions", feature: "clinical", permission: "viewClinical",
    children: [
      { href: "/dashboard/treatment-plans", label: "Treatment plans", feature: "clinical", permission: "viewClinical" },
      { href: "/dashboard/prescriptions", label: "Prescriptions", feature: "clinical", permission: "viewClinical" },
    ],
  },
  {
    href: "/dashboard/billing", label: "Money", icon: IndianRupee, hint: "Invoices and payments", feature: "billing",
    children: [
      { href: "/dashboard/billing/new", label: "Raise a bill", feature: "billing" },
      { href: "/dashboard/settings/billing", label: "How your bills look", feature: "billing" },
    ],
  },
  {
    href: "/dashboard/conversations", label: "Messages", icon: MessagesSquare, hint: "WhatsApp inbox and automations", feature: "whatsapp", permission: "sendWhatsApp", badge: "messages",
  },
  { href: "/dashboard/growth", label: "Growth", icon: Sprout, hint: "Enquiries and patients to call back", feature: "crm", permission: "managePatients", badge: "growth" },
  {
    href: "/dashboard/laboratory", label: "Laboratory", icon: FlaskConical, hint: "Cases out with the lab", feature: "laboratory", permission: "manageLaboratory", badge: "laboratory",
  },
  { href: "/dashboard/imaging", label: "Imaging", icon: Scan, hint: "X-rays and scans", feature: "imaging", permission: "viewImaging", badge: "imaging" },
  { href: "/dashboard/operations", label: "Operations", icon: PackageCheck, hint: "Stock, suppliers and the day sheet", feature: "inventory", permission: "manageInventory" },
  {
    href: "/dashboard/insights", label: "Insights", icon: BarChart3, hint: "How the clinic is doing", feature: "reports", permission: "exportData",
    children: [
      { href: "/dashboard/exports", label: "Take your data out", permission: "exportData" },
    ],
  },
];

/** Pinned below the rail, away from the daily destinations. */
export const NAV_SETTINGS: NavDestination = {
  href: "/dashboard/settings",
  label: "Settings",
  icon: Settings,
  hint: "Clinic, people, billing identity and exports",
  children: [
    { href: "/dashboard/help", label: "How things work here" },
    { href: "/dashboard/launch", label: "Getting the clinic live", permission: "manageClinic" },
  ],
};

export type NavCounts = Partial<Record<NavBadgeKey, number>>;

/** True when `pathname` is inside `href`. /dashboard only ever matches itself. */
export function isActiveHref(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The icons are React components, so the whole destination cannot cross the
 * server/client boundary. The server works out which hrefs this person may see
 * and sends just those; the shell resolves them back to icons on the client.
 */
export function visibleHrefs(
  features: Record<FeatureKey, boolean>,
  permissions: readonly Permission[],
): string[] {
  const allowed = (entry: { feature?: FeatureKey; permission?: Permission }) =>
    (!entry.feature || features[entry.feature]) &&
    (!entry.permission || permissions.includes(entry.permission));

  const hrefs: string[] = [];
  for (const item of [...NAV_DESTINATIONS, NAV_SETTINGS]) {
    if (!allowed(item)) continue;
    hrefs.push(item.href);
    // A child is only offered when its own gate passes as well as its parent's.
    for (const child of item.children ?? []) if (allowed(child)) hrefs.push(child.href);
  }
  return hrefs;
}

export function destinationsFor(hrefs: readonly string[]): NavDestination[] {
  return NAV_DESTINATIONS.filter((item) => hrefs.includes(item.href)).map((item) => ({
    ...item,
    children: item.children?.filter((child) => hrefs.includes(child.href)),
  }));
}

/** Settings is pinned separately, so its children are resolved separately too. */
export function settingsFor(hrefs: readonly string[]): NavDestination {
  return {
    ...NAV_SETTINGS,
    children: NAV_SETTINGS.children?.filter((child) => hrefs.includes(child.href)),
  };
}
