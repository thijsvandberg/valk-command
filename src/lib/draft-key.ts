/**
 * Synthetic local key prefix for draft tickets that do not yet have a real Jira
 * issue. Kept in a dependency-free module (no `@/db`, no server-only imports) so
 * that both client components and server code share a single definition and the
 * check never drags the database layer into the client bundle.
 */
export const DRAFT_KEY_PREFIX = "DRAFT-";

export function isDraftKey(key: string): boolean {
  return key.startsWith(DRAFT_KEY_PREFIX);
}
