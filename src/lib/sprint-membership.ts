import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticketSprint } from "@/db/schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Accepts the top-level db or a transaction handle: better-sqlite3 drizzle calls
// run synchronously, so the same code path serves both the sync path's transaction
// and the standalone create/move writers.
export type SprintMembershipExecutor = Db | Tx;

// Mirror the board's membership semantics exactly: sprint_ids wins when present,
// otherwise the single sprint_name is the sole membership (legacy rows), and a
// backlog/no-sprint ticket has no membership at all. Resolving here moves the
// former query-time OR-branch to write time so the read can be a plain indexed join.
export function resolveSprintMembership(
  sprintIds: string[] | null | undefined,
  sprintName: string | null | undefined,
): string[] {
  if (sprintIds && sprintIds.length > 0) {
    return Array.from(new Set(sprintIds));
  }
  if (sprintName) {
    return [sprintName];
  }
  return [];
}

// Rewrite the ticket_sprint bridge rows for a ticket to match its current sprint
// membership. Delete-then-insert keeps it convergent regardless of prior state.
export function syncTicketSprints(
  executor: SprintMembershipExecutor,
  ticketKey: string,
  sprintIds: string[] | null | undefined,
  sprintName: string | null | undefined,
): void {
  const ids = resolveSprintMembership(sprintIds, sprintName);
  executor.delete(ticketSprint).where(eq(ticketSprint.ticketKey, ticketKey)).run();
  if (ids.length > 0) {
    executor.insert(ticketSprint).values(ids.map((sprintId) => ({ ticketKey, sprintId }))).run();
  }
}
