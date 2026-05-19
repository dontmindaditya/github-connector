import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import type { User } from "@prisma/client";

/**
 * App-user session.
 *
 * This is a deliberately thin stub. Replace the body of `getCurrentUser()`
 * with whatever your real auth provider gives you — NextAuth's `auth()`,
 * Clerk's `currentUser()`, Supabase Auth, your own JWT, etc.
 *
 * The rest of the connector only depends on `getCurrentUser()` returning a
 * User row (or null). Keep that contract and the upstream auth swap is
 * one-file.
 *
 * The minimal session model used here
 * -----------------------------------
 * - `session_user_id` cookie holds the user's DB id, signed with our app
 *   secret. Good enough to keep moving. In production, use a real auth lib.
 */

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = store.get("session_user_id")?.value;
  if (!userId) return null;

  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Required-user variant. Throws if there's no session — call this from
 * route handlers that already check auth at the top.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("Not authenticated");
  }
  return user;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}