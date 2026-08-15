import { requireUser } from "@/lib/auth";
import { clinicDisplayName } from "@/lib/clinic-config";
import DashboardInteractionFeedback from "@/components/dashboard/DashboardInteractionFeedback";
import AppShell from "@/components/shell/AppShell";
import { visibleHrefs, type NavCounts } from "@/components/shell/nav-items";
import type { ShellAlert } from "@/components/shell/TopBar";
import { prisma } from "@/lib/prisma";
import { getFeatureEntitlements } from "@/lib/features";
import { can, PERMISSIONS, type Permission } from "@/lib/permissions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [
    todayVisits,
    overdueFollowUps,
    failedMessages,
    openConversations,
    delayedLabCases,
    lowStockItems,
    features,
    unmatchedImaging,
    unreviewedImaging,
  ] = await Promise.all([
    prisma.appointment.count({
      where: {
        clinicId: user.clinicId,
        archivedAt: null,
        appointmentDate: { gte: startOfDay, lt: endOfDay },
        status: { notIn: ["Cancelled", "Completed"] },
      },
    }),
    prisma.followUpTask.count({
      where: {
        clinicId: user.clinicId,
        status: { in: ["PENDING", "FAILED"] },
        scheduledFor: { lte: now },
      },
    }),
    prisma.scheduledWhatsAppMessage.count({
      where: { clinicId: user.clinicId, status: { in: ["FAILED", "DEAD_LETTER"] } },
    }),
    prisma.whatsAppConversation.count({ where: { clinicId: user.clinicId, status: "OPEN" } }),
    prisma.labCase.count({
      where: {
        clinicId: user.clinicId,
        dueDate: { lt: now },
        status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { clinicId: user.clinicId, active: true },
      select: { quantity: true, reorderLevel: true },
    }),
    getFeatureEntitlements(user.clinicId),
    can(user.role, "uploadImaging")
      ? prisma.imagingStudy.count({
          where: {
            clinicId: user.clinicId,
            matchStatus: "UNMATCHED",
            archivedAt: null,
            enteredInErrorAt: null,
          },
        })
      : 0,
    can(user.role, "signImaging")
      ? prisma.imagingStudy.count({
          where: {
            clinicId: user.clinicId,
            matchStatus: "CONFIRMED",
            status: { not: "REVIEWED" },
            archivedAt: null,
            enteredInErrorAt: null,
          },
        })
      : 0,
  ]);

  const lowStock = lowStockItems.filter((item) => item.quantity <= item.reorderLevel).length;
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((permission) =>
    can(user.role, permission),
  );

  const counts: NavCounts = {
    today: todayVisits,
    messages: openConversations,
    growth: overdueFollowUps,
    laboratory: delayedLabCases,
    imaging: unmatchedImaging + unreviewedImaging,
  };

  const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

  const alerts: ShellAlert[] = ([
    overdueFollowUps > 0 && {
      label: `${overdueFollowUps} ${plural(overdueFollowUps, "patient", "patients")} to call back`,
      detail: "These follow-ups are past their date and still need an outcome.",
      href: "/dashboard/growth?show=overdue",
      tone: "danger" as const,
    },
    delayedLabCases > 0 && {
      label: `${delayedLabCases} lab ${plural(delayedLabCases, "case is", "cases are")} late`,
      detail: "Ring the lab before the patient turns up for the fit.",
      href: "/dashboard/laboratory",
      tone: "danger" as const,
    },
    failedMessages > 0 && {
      label: `${failedMessages} WhatsApp ${plural(failedMessages, "message", "messages")} did not go out`,
      detail: "See what went wrong, then send it again.",
      href: "/dashboard/whatsapp-operations",
      tone: "warning" as const,
    },
    unmatchedImaging > 0 && {
      label: `${unmatchedImaging} X-${plural(unmatchedImaging, "ray needs", "rays need")} a name`,
      detail: "Captured but not yet matched to a patient.",
      href: "/dashboard/imaging?status=unmatched",
      tone: "warning" as const,
    },
    unreviewedImaging > 0 && {
      label: `${unreviewedImaging} ${plural(unreviewedImaging, "scan is", "scans are")} waiting on sign-off`,
      detail: "Open the imaging review queue.",
      href: "/dashboard/imaging?status=unreviewed",
      tone: "info" as const,
    },
    lowStock > 0 && {
      label: `${lowStock} ${plural(lowStock, "item is", "items are")} running low`,
      detail: "Reorder before you run out mid-procedure.",
      href: "/dashboard/operations",
      tone: "warning" as const,
    },
  ] as Array<ShellAlert | false>).filter((alert): alert is ShellAlert => alert !== false);

  return (
    <>
      <DashboardInteractionFeedback />
      <AppShell
        navHrefs={visibleHrefs(features, permissions)}
        counts={counts}
        alerts={alerts}
        clinicName={clinicDisplayName(user.clinic)}
        branch={user.clinic.address || "Your clinic"}
        logoUrl={user.clinic.logoUrl}
        user={{ fullName: user.fullName, role: user.role }}
      >
        {children}
      </AppShell>
    </>
  );
}
