import "server-only";

import { Prisma } from "@prisma/client";
import { hashLabPortalToken } from "@/lib/laboratory-access-core";
import { isLabCaseStatus } from "@/lib/laboratory-core";
import { prisma } from "@/lib/prisma";

export async function resolveLabPortalAccess(token: string) {
  if (!/^[A-Za-z0-9_-]{32,120}$/.test(token)) return null;
  const access = await prisma.labPortalAccess.findUnique({
    where: { tokenHash: hashLabPortalToken(token) },
    include: { laboratory: true, labCase: true },
  });
  if (!access || access.revokedAt || access.expiresAt <= new Date() || access.labCase.cancelledAt) return null;
  return access;
}

export async function markLabPortalViewed(token: string) {
  const access = await resolveLabPortalAccess(token);
  if (!access) return null;
  if (access.lastViewedAt) return access;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const marked = await tx.labPortalAccess.updateMany({ where: { id: access.id, lastViewedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { lastViewedAt: now } });
    if (!marked.count) return;
    // Redeeming a valid case token is direct evidence that the laboratory viewed
    // the order, even when the clinic copied the link instead of emailing it.
    const transition = isLabCaseStatus(access.labCase.status) && ["APPROVED", "QUEUED", "SENT", "DELIVERED_TO_ENDPOINT", "SENT_TO_LAB"].includes(access.labCase.status);
    if (transition) await tx.labCase.update({ where: { id: access.labCase.id }, data: { status: "VIEWED", firstViewedAt: now, version: { increment: 1 } } });
    await tx.labDeliveryAttempt.updateMany({ where: { portalAccessId: access.id, viewedAt: null }, data: { viewedAt: now, status: "VIEWED" } });
    await tx.labCaseEvent.create({ data: { clinicId: access.clinicId, labCaseId: access.labCase.id, type: "VIEWED", actorName: access.contactName || access.laboratory.name, actorType: "LAB", portalAccessId: access.id, fromStatus: transition ? access.labCase.status : null, toStatus: transition ? "VIEWED" : access.labCase.status, notes: "Secure laboratory portal opened.", idempotencyKey: `lab-viewed:${access.id}` } });
    await tx.patientTimelineEvent.create({ data: { clinicId: access.clinicId, patientId: access.labCase.patientId, encounterId: access.labCase.encounterId, eventType: "LAB_ORDER_VIEWED", objectType: "LAB_CASE", objectId: String(access.labCase.id), title: "Laboratory opened secure order", summary: access.labCase.orderNumber, source: "LAB_PORTAL", idempotencyKey: `lab-viewed:${access.id}` } });
    await tx.auditLog.create({ data: { clinicId: access.clinicId, patientId: access.labCase.patientId, actorRole: "LAB_PORTAL", action: "LAB_PORTAL_CASE_VIEWED", entityType: "LAB_CASE", entityId: String(access.labCase.id), source: "LAB_PORTAL", afterState: { portalAccessId: access.id, status: transition ? "VIEWED" : access.labCase.status } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return resolveLabPortalAccess(token);
}
