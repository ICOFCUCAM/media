import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. The only way the rest of the codebase touches the DB
 * (see docs/03-folder-structure.md). Avoids exhausting connections in dev HMR.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
