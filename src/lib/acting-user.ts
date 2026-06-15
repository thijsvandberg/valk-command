import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { logger } from "@/lib/logger";

export interface ActingUser {
  name: string | null;
  avatar: string | null;
}

/**
 * Resolve the Bridge user who triggered the current request.
 *
 * Middleware forwards the authenticated Clerk user id as the `x-bridge-user-id`
 * header (see src/middleware.ts). We look up that user's display name and avatar
 * from Clerk so server-side actions (e.g. pushing edits to Jira) can attribute
 * work to the human who did it rather than to the shared Jira API token account.
 *
 * Returns null when no user is available (public routes, the dev bypass, or
 * outside a request scope) so callers can fall back to existing behaviour.
 */
export async function getActingUser(): Promise<ActingUser | null> {
  let userId: string | null;
  try {
    const requestHeaders = await headers();
    userId = requestHeaders.get("x-bridge-user-id");
  } catch {
    return null;
  }
  if (!userId) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      user.primaryEmailAddress?.emailAddress ||
      null;
    return { name, avatar: user.imageUrl ?? null };
  } catch (err) {
    logger.warn("acting-user", `failed to resolve Clerk user ${userId}:`, err);
    return null;
  }
}
