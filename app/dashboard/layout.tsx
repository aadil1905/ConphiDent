import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import { requireUser } from "@/lib/auth";
import { clinicDisplayName } from "@/lib/clinic-config";
import LogoutButton from "./logout-button";
import DashboardInteractionFeedback from "@/components/dashboard/DashboardInteractionFeedback";
import { prisma } from "@/lib/prisma";
import { getFeatureEntitlements } from "@/lib/features";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const now = new Date();
  const [overdueFollowUps, failedMessages, delayedLabCases, inventoryItems, features] = await Promise.all([
    prisma.followUpTask.count({ where: { clinicId: user.clinicId, status: { in: ["PENDING", "FAILED"] }, scheduledFor: { lte: now } } }),
    prisma.scheduledWhatsAppMessage.count({ where: { clinicId: user.clinicId, status: { in: ["FAILED", "DEAD_LETTER"] } } }),
    prisma.labCase.count({ where: { clinicId: user.clinicId, dueDate: { lt: now }, status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] } } }),
    prisma.inventoryItem.findMany({ where: { clinicId: user.clinicId, active: true }, select: { quantity: true, reorderLevel: true } }),
    getFeatureEntitlements(user.clinicId),
  ]);
  const lowStock = inventoryItems.filter((item) => item.quantity <= item.reorderLevel).length;
  const notifications = [
    overdueFollowUps ? { label: `${overdueFollowUps} recovery task${overdueFollowUps === 1 ? "" : "s"} need attention`, detail: "Overdue follow-ups require an owner or outcome.", href: "/dashboard/follow-ups" } : null,
    failedMessages ? { label: `${failedMessages} WhatsApp message${failedMessages === 1 ? "" : "s"} failed`, detail: "Review delivery diagnostics before retrying.", href: "/dashboard/whatsapp-operations" } : null,
    delayedLabCases ? { label: `${delayedLabCases} lab case${delayedLabCases === 1 ? "" : "s"} delayed`, detail: "Confirm laboratory status and next patient action.", href: "/dashboard/laboratory" } : null,
    lowStock ? { label: `${lowStock} low-stock item${lowStock === 1 ? "" : "s"}`, detail: "Create or receive a purchase order before supplies run out.", href: "/dashboard/operations" } : null,
  ].filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <DashboardInteractionFeedback />
      <Sidebar role={user.role} clinicName={clinicDisplayName(user.clinic)} logoUrl={user.clinic.logoUrl} features={features} />

      <main className="min-w-0">
        <div className="relative">
          <Navbar
            user={{
              fullName: user.fullName,
              role: user.role,
              clinicName: clinicDisplayName(user.clinic),
              clinicAddress: user.clinic.address || "Your secure clinic workspace",
            }}
            notifications={notifications}
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
