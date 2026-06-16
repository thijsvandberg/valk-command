import { resolveUserId } from "@/lib/user-settings";
import { getActingUser, getActingUserJiraIdentity } from "@/lib/acting-user";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

/**
 * Resolve the acting user for the New story inbox (BRDG-359): their Clerk id (for
 * per-user read state) and Jira self-identity (for self-exclusion). The Clerk
 * name lookup is only made as a fallback when no stable Jira accountId is
 * recorded, to avoid a Clerk round-trip on the common path.
 */
export async function resolveNewStoryQueryCtx(): Promise<NewStoryQueryCtx> {
  const userId = await resolveUserId();
  const identity = await getActingUserJiraIdentity();

  let jiraName: string | null = null;
  if (!identity?.accountId) {
    const actingUser = await getActingUser();
    jiraName = actingUser?.name ?? null;
  }

  return { userId, jiraAccountId: identity?.accountId ?? null, jiraName };
}
