import { headers } from "next/headers";
import { clerkClient } from "@clerk/nextjs/server";
import { logger } from "@/lib/logger";
import { readUserSetting } from "@/lib/user-settings";

export interface ActingUser {
  name: string | null;
  avatar: string | null;
}

const MY_JIRA_IDENTITY_KEY = "my_jira_identity";

export interface ActingUserJiraIdentity {
  accountId: string;
  email: string | null;
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

/**
 * Resolve the current user's Jira identity for "me" comparisons (BRDG-360).
 *
 * Returns the stable Jira accountId (+ email) the signed-in user recorded via the
 * `my_jira_identity` per-account setting, so server-side "is this mine" checks can
 * key on the GUID instead of a brittle display-name match. The Jira user-search /
 * "/myself" API is outside the token's scope, so this mapping is set explicitly
 * rather than resolved automatically.
 *
 * Returns null when no user is in scope or none has been recorded, letting callers
 * fall back to the existing name-based behaviour.
 *
 * Future hook: when a synced ticket's captured assignee/reporter email matches the
 * Clerk user's email, the accountId is already in our data and could seed this
 * setting automatically — left unbuilt for now.
 */
export async function getActingUserJiraIdentity(): Promise<ActingUserJiraIdentity | null> {
  let userId: string | null;
  try {
    const requestHeaders = await headers();
    userId = requestHeaders.get("x-bridge-user-id");
  } catch {
    return null;
  }
  if (!userId) return null;

  try {
    const raw = await readUserSetting(MY_JIRA_IDENTITY_KEY, userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accountId?: unknown; email?: unknown };
    if (typeof parsed.accountId !== "string" || !parsed.accountId) return null;
    return {
      accountId: parsed.accountId,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch (err) {
    logger.warn("acting-user", `failed to read Jira identity for ${userId}:`, err);
    return null;
  }
}
