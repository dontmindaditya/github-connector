import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev mode hot-reloads modules constantly. Without this guard, every
 * reload creates a new PrismaClient, which opens a new pool of Postgres
 * connections. After a few minutes you'll hit the connection limit and
 * everything stops working.
 *
 * The fix: stash the instance on `globalThis` so hot reloads reuse the same
 * client. In production we just instantiate normally — there's no HMR there.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}