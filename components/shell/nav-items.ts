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

export type NavDestination = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Longer hint shown in the collapsed rail tooltip and the drawer. */
  hint: string;
  feature?: FeatureKey;
  permission?: Permission;
  badge?: NavBadgeKey;
};

/**
 * The thirteen destinations, in the order Phase B fixed them. Labels name the
 * page they open — no more "Reports" opening /analytics.
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { href: "/dashboard", label: "Today", icon: Home, hint: "What needs you right now", badge: "today" },
  { href: "/dashboard/appointments", label: "Schedule", icon: CalendarDays, hint: "The diary, day and week", feature: "appointments", permission: "manageSchedule" },
  { href: "/dashboard/patients", label: "Patients", icon: Users, hint: "Everyone on your list", feature: "patients", permission: "managePatients" },
  { href: "/dashboard/clinical-workspace", label: "Clinical", icon: Activity, hint: "Charting, notes and prescriptions", feature: "clinical", permission: "viewClinical" },
  { href: "/dashboard/billing", label: "Money", icon: IndianRupee, hint: "Invoices and payments", feature: "billing" },
  { href: "/dashboard/conversations", label: "Messages", icon: MessagesSquare, hint: "WhatsApp inbox and automations", feature: "whatsapp", permission: "sendWhatsApp", badge: "messages" },
  { href: "/dashboard/growth", label: "Growth", icon: Sprout, hint: "Enquiries and patients to call back", feature: "crm", permission: "managePatients", badge: "growth" },
  { href: "/dashboard/laboratory", label: "Laboratory", icon: FlaskConical, hint: "Cases out with the lab", feature: "laboratory", permission: "manageLaboratory", badge: "laboratory" },
  { href: "/dashboard/imaging", label: "Imaging", icon: Scan, hint: "X-rays and scans", feature: "imaging", permission: "viewImaging", badge: "imaging" },
  { href: "/dashboard/operations", label: "Operations", icon: PackageCheck, hint: "Stock, suppliers and the day sheet", feature: "inventory", permission: "manageInventory" },
  { href: "/dashboard/insights", label: "Insights", icon: BarChart3, hint: "How the clinic is doing", feature: "reports", permission: "exportData" },
];

/** Pinned below the rail, away from the daily destinations. */
export const NAV_SETTINGS: NavDestination = {
  href: "/dashboard/settings",
  label: "Settings",
  icon: Settings,
  hint: "Clinic, people, billing identity and exports",
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
  return NAV_DESTINATIONS.filter(
    (item) =>
      (!item.feature || features[item.feature]) &&
      (!item.permission || permissions.includes(item.permission)),
  ).map((item) => item.href);
}

export function destinationsFor(hrefs: readonly string[]): NavDestination[] {
  return NAV_DESTINATIONS.filter((item) => hrefs.includes(item.href));
}
