import "server-only";

import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SecureDocumentType = "INVOICE" | "PRESCRIPTION" | "LAB_ORDER";

export function secureDocumentTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function applicationOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  const candidate = configured || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const url = new URL(candidate);
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") throw new Error("Secure document origin must use HTTPS in production.");
    const allowedHosts = new Set(["conphident.live", "www.conphident.live", process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL].filter((value): value is string => Boolean(value)));
    if (!allowedHosts.has(url.host)) throw new Error("Secure document origin is not an approved production host.");
  }
  return url.origin;
}

type SecureDocumentClient = Pick<Prisma.TransactionClient, "secureDocumentAccess">;

export async function createSecureDocumentLink(input: { clinicId: number; patientId: number; documentType: SecureDocumentType; documentId: number; createdByUserId?: number; expiresInHours?: number }, db: SecureDocumentClient = prisma) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Math.min(168, Math.max(1, input.expiresInHours || 72)) * 3_600_000);
  await db.secureDocumentAccess.create({ data: { clinicId: input.clinicId, patientId: input.patientId, documentType: input.documentType, documentId: input.documentId, tokenHash: secureDocumentTokenHash(token), expiresAt, createdByUserId: input.createdByUserId } });
  return { url: `${applicationOrigin()}/shared/${token}`, expiresAt };
}
