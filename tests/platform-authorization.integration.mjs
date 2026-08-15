import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path) => readFileSync(resolve(root, path), "utf8");

test("every Control Center page with sensitive portfolio data uses a named permission", () => {
  const expected = new Map([
    ["app/platform/page.tsx", "tenant.read"],
    ["app/platform/audit/page.tsx", "logs.read"],
    ["app/platform/automations/page.tsx", "whatsapp.manage"],
    ["app/platform/health/page.tsx", "deployment.read"],
    ["app/platform/notifications/page.tsx", "logs.read"],
    ["app/platform/sales/page.tsx", "onboarding.manage"],
    ["app/platform/clinics/[clinicId]/page.tsx", "tenant.read"],
  ]);

  for (const [path, permission] of expected) {
    const page = source(path);
    assert.match(page, new RegExp(`requirePlatformPermission\\("${permission.replace(".", "\\.")}\"\\)`), `${path} must require ${permission}`);
    assert.doesNotMatch(page, /requirePlatformAdmin\(/, `${path} must not use the broad legacy page guard`);
  }
});

test("the server layout calculates and passes the operator's effective permissions", () => {
  const layout = source("app/platform/layout.tsx");
  assert.match(layout, /PLATFORM_PERMISSIONS\.filter\(\(permission\) => hasPlatformPermission\(admin, permission\)\)/);
  assert.match(layout, /<PlatformSidebar[^>]+permissions=\{permissions\}/);
  assert.match(layout, /<PlatformTopbar[^>]+permissions=\{permissions\}/);
  assert.match(layout, /platformRoleFor\(admin\)/);
});

test("the portfolio overview gates cross-domain metrics and activity independently", () => {
  const overview = source("app/platform/page.tsx");
  assert.match(overview, /canViewAnalytics = hasPlatformPermission\(admin, "analytics\.read"\)/);
  assert.match(overview, /canViewWhatsApp = hasPlatformPermission\(admin, "whatsapp\.read"\)/);
  assert.match(overview, /canViewLogs = hasPlatformPermission\(admin, "logs\.read"\)/);
  assert.match(overview, /canCreateTenant = hasPlatformPermission\(admin, "tenant\.create"\)/);
  assert.match(overview, /canViewWhatsApp \? prisma\.whatsAppMessage\.groupBy/);
  assert.match(overview, /canViewLogs \? prisma\.auditLog\.findMany/);
});

test("Control Center navigation is permission filtered and has one truthful destination per item", () => {
  const sidebar = source("components/platform/PlatformSidebar.tsx");
  const destinations = [...sidebar.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]);

  assert.match(sidebar, /group\.items\.filter\(\(item\) => permissionSet\.has\(item\.permission\)\)/);
  assert.equal(destinations.filter((href) => href === "/platform/billing").length, 1);
  assert.equal(destinations.filter((href) => href === "/platform/infrastructure").length, 1);
  assert.ok(destinations.includes("/platform/analytics"));
  assert.ok(destinations.includes("/platform/operations"));
  assert.match(sidebar, /href: "\/platform\/analytics"[^\n]+permission: "analytics\.read"/);
  assert.match(sidebar, /href: "\/platform\/operations"[^\n]+permission: "support\.manage"/);
  assert.match(sidebar, /href: "\/platform\/automations"[^\n]+permission: "whatsapp\.manage"/);
  assert.doesNotMatch(sidebar, /label: "Conversations"/);
});

test("read-only identity operators never receive user or platform-admin mutation controls", () => {
  const users = source("app/platform/users/page.tsx");
  assert.match(users, /canManagePlatformAdmins = hasPlatformPermission\(admin, "admins\.manage"\)/);
  assert.match(users, /canManageClinicUsers = hasPlatformPermission\(admin, "user\.manage"\)/);
  assert.match(users, /canManagePlatformAdmins \? <>[\s\S]*?action=\{setPlatformAdminRoleAction\}[\s\S]*?action=\{revokeUserSessionsAction\}[\s\S]*?: <span[^>]*>Read-only access<\/span>/);
  assert.match(users, /canManageClinicUsers \? <>[\s\S]*?action=\{updateClinicUserAction\}[\s\S]*?action=\{revokeUserSessionsAction\}[\s\S]*?: <span[^>]*>Read-only access<\/span>/);
});

test("the Control Center uses the clinic-style off-canvas shell at every viewport", () => {
  const sidebar = source("components/platform/PlatformSidebar.tsx");
  const layout = source("app/platform/layout.tsx");
  const styles = source("app/globals.css");

  assert.match(sidebar, /aria-controls="platform-navigation"/);
  assert.match(sidebar, /inert=\{!open\}/);
  assert.doesNotMatch(sidebar, /collapsed|localStorage/);
  assert.match(styles, /\.platform-sidebar\s*\{[\s\S]*?transform:\s*translateX\(-100%\)/);
  assert.match(styles, /\.platform-sidebar--open\s*\{\s*transform:\s*translateX\(0\)/);
  assert.match(styles, /\.platform-nav-overlay\s*\{[\s\S]*?z-index:\s*75/);
  assert.match(styles, /\.platform-topbar\s*\{[\s\S]*?height:\s*5rem/);
  assert.match(styles, /\.platform-shell__content\s*\{[\s\S]*?max-width:\s*var\(--workspace-content-max\)/);
  assert.match(layout, /<PlatformInteractionFeedback\s*\/>/);
});

test("Control Center chrome exposes permission-safe and recoverable interaction states", () => {
  const topbar = source("components/platform/PlatformTopbar.tsx");
  const search = source("components/platform/PlatformCommandSearch.tsx");
  const errorBoundary = source("app/platform/error.tsx");
  const styles = source("app/globals.css");

  assert.match(topbar, /permissionSet\.has\("logs\.read"\)/);
  assert.match(topbar, /permissionSet\.has\("user\.read"\)/);
  assert.match(search, /useFormStatus\(\)/);
  assert.match(search, /disabled=\{pending\}/);
  assert.match(errorBoundary, /onClick=\{reset\}/);
  assert.match(errorBoundary, /role="alert"/);
  assert.match(styles, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--primary\)/);
  assert.match(styles, /\[data-platform-pending="true"\]/);
  assert.match(styles, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
