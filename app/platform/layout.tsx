import type { Metadata } from "next";
import { PLATFORM_PERMISSIONS, hasPlatformPermission, platformRoleFor, requirePlatformPermission } from "@/lib/platform";
import { PlatformSidebar } from "@/components/platform/PlatformSidebar";
import { PlatformTopbar } from "@/components/platform/PlatformTopbar";
import { PlatformInteractionFeedback } from "@/components/platform/PlatformInteractionFeedback";
import { brandFontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Control Center",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformPermission("tenant.read");
  const role = platformRoleFor(admin);
  const permissions = PLATFORM_PERMISSIONS.filter((permission) => hasPlatformPermission(admin, permission));

  return (
    // cf-portal re-themes the operator surface to the public site's palette and
    // type, so setup.conphident.live reads as one product across the login
    // boundary. platform-shell keeps owning the layout itself.
    <div className={`platform-shell cf-portal ${brandFontVariables} min-h-screen text-foreground`}>
      <PlatformInteractionFeedback />
      <PlatformSidebar fullName={admin.fullName} role={role} permissions={permissions} />
      <div className="platform-shell__workspace">
        <PlatformTopbar fullName={admin.fullName} role={role} environment={process.env.VERCEL_ENV || process.env.NODE_ENV || "development"} permissions={permissions} />
        <div className="platform-shell__content">{children}</div>
      </div>
    </div>
  );
}
