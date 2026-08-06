import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { requireUser } from "@/lib/auth";
import { clinicDisplayName } from "@/lib/clinic-config";
import { isPlatformAdmin } from "@/lib/platform";
import LogoutButton from "./logout-button";
import DashboardInteractionFeedback from "@/components/dashboard/DashboardInteractionFeedback";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <DashboardInteractionFeedback />
      <Sidebar role={user.role} clinicName={clinicDisplayName(user.clinic)} logoUrl={user.clinic.logoUrl} platformAdmin={isPlatformAdmin(user)} />

      <main className="min-w-0">
        <div className="relative">
          <Navbar
            user={{
              fullName: user.fullName,
              role: user.role,
              clinicName: clinicDisplayName(user.clinic),
              clinicAddress: user.clinic.address || "Your secure clinic workspace",
            }}
            notifications={[]}
          />

          <div className="absolute right-6 top-1/2 -translate-y-1/2 lg:right-10">
            <LogoutButton />
          </div>
        </div>

        <div className="dashboard-shell mx-auto w-full max-w-[1750px] overflow-x-hidden p-5 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-20">
          {children}
        </div>
      </main>
    </div>
  );
}
