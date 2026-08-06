import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient();

// Reuse the client inside warm serverless instances instead of opening a new
// database pool for every module evaluation.
globalForPrisma.prisma = prisma;
