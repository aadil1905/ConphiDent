import { PrismaClient } from "@prisma/client";

import { tenantGuard } from "@/lib/tenant-guard";

/**
 * Every query goes through `tenantGuard`, which refuses to run a read or write
 * on a tenant-scoped model that carries no `clinicId` filter. Tenancy is still
 * written by hand at each call site; this is the backstop underneath it, so a
 * forgotten clause is an error rather than another clinic's patient list. See
 * `lib/tenant-guard.ts` for what it does not do, and why.
 */
const client = () => new PrismaClient().$extends(tenantGuard());

const globalForPrisma = global as unknown as {
  prisma: ReturnType<typeof client> | undefined;
};

export const prisma = globalForPrisma.prisma ?? client();

// Reuse the client inside warm serverless instances instead of opening a new
// database pool for every module evaluation.
globalForPrisma.prisma = prisma;

/**
 * The database handle, guard and all.
 *
 * Use this instead of `Prisma.TransactionClient` on any helper that takes
 * "either the client or a transaction". Both are the extended flavour now, and
 * the unextended `Prisma.TransactionClient` no longer describes either of them.
 */
export type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
