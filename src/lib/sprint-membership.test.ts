// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createTestDb, closeAllTestDbs } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { ticket, ticketSprint } from "@/db/schema";
import { resolveSprintMembership, syncTicketSprints } from "./sprint-membership";

let db: BetterSQLite3Database<typeof schema>;

function seedTicketRow(key: string) {
  db.insert(ticket).values({ jiraKey: key, title: key, status: "TO DO" }).run();
}

function bridgeFor(key: string): string[] {
  return db
    .select({ sprintId: ticketSprint.sprintId })
    .from(ticketSprint)
    .where(eq(ticketSprint.ticketKey, key))
    .orderBy(asc(ticketSprint.sprintId))
    .all()
    .map((r) => r.sprintId);
}

describe("resolveSprintMembership", () => {
  it("uses sprint_ids when present", () => {
    expect(resolveSprintMembership(["123", "456"], "456")).toEqual(["123", "456"]);
  });

  it("falls back to sprint_name when sprint_ids is null or empty", () => {
    expect(resolveSprintMembership(null, "555")).toEqual(["555"]);
    expect(resolveSprintMembership([], "555")).toEqual(["555"]);
  });

  it("returns no membership for backlog / no sprint", () => {
    expect(resolveSprintMembership(null, "")).toEqual([]);
    expect(resolveSprintMembership(null, null)).toEqual([]);
    expect(resolveSprintMembership([], "")).toEqual([]);
  });

  it("dedupes repeated ids", () => {
    expect(resolveSprintMembership(["7", "7", "8"], null)).toEqual(["7", "8"]);
  });
});

describe("syncTicketSprints", () => {
  beforeEach(() => {
    db = createTestDb();
  });
  afterAll(() => closeAllTestDbs());

  it("writes one bridge row per sprint id", () => {
    seedTicketRow("VPL-1");
    syncTicketSprints(db, "VPL-1", ["123", "456"], "456");
    expect(bridgeFor("VPL-1")).toEqual(["123", "456"]);
  });

  it("writes a single row from sprint_name when sprint_ids is null", () => {
    seedTicketRow("VPL-2");
    syncTicketSprints(db, "VPL-2", null, "555");
    expect(bridgeFor("VPL-2")).toEqual(["555"]);
  });

  it("writes no rows for a backlog ticket", () => {
    seedTicketRow("VPL-3");
    syncTicketSprints(db, "VPL-3", null, "");
    expect(bridgeFor("VPL-3")).toEqual([]);
  });

  it("converges: a later set replaces the earlier one with no stale rows", () => {
    seedTicketRow("VPL-4");
    syncTicketSprints(db, "VPL-4", ["100", "200"], "200");
    expect(bridgeFor("VPL-4")).toEqual(["100", "200"]);

    syncTicketSprints(db, "VPL-4", ["300"], "300");
    expect(bridgeFor("VPL-4")).toEqual(["300"]);

    syncTicketSprints(db, "VPL-4", null, "");
    expect(bridgeFor("VPL-4")).toEqual([]);
  });

  it("dedupes duplicate ids without throwing on the composite primary key", () => {
    seedTicketRow("VPL-5");
    expect(() => syncTicketSprints(db, "VPL-5", ["9", "9"], null)).not.toThrow();
    expect(bridgeFor("VPL-5")).toEqual(["9"]);
  });
});

describe("0078 backfill SQL", () => {
  beforeEach(() => {
    db = createTestDb();
  });
  afterAll(() => closeAllTestDbs());

  // migrate() runs the backfill against an empty table in tests, so exercise the two
  // statements directly against representative pre-existing rows.
  function runBackfill() {
    db.run(
      sql.raw(
        "INSERT OR IGNORE INTO ticket_sprint (ticket_key, sprint_id) SELECT t.jira_key, je.value FROM ticket t, json_each(t.sprint_ids) je WHERE t.sprint_ids IS NOT NULL",
      ),
    );
    db.run(
      sql.raw(
        "INSERT OR IGNORE INTO ticket_sprint (ticket_key, sprint_id) SELECT t.jira_key, t.sprint_name FROM ticket t WHERE t.sprint_ids IS NULL AND t.sprint_name IS NOT NULL AND t.sprint_name != ''",
      ),
    );
  }

  it("backfills array, legacy-name, and backlog rows with the right membership", () => {
    db.insert(ticket).values([
      { jiraKey: "A", title: "A", status: "TO DO", sprintName: "456", sprintIds: JSON.stringify(["123", "456"]) },
      { jiraKey: "B", title: "B", status: "TO DO", sprintName: "555", sprintIds: null },
      { jiraKey: "C", title: "C", status: "TO DO", sprintName: "", sprintIds: null },
      { jiraKey: "D", title: "D", status: "TO DO", sprintName: null, sprintIds: null },
    ]).run();

    runBackfill();

    expect(bridgeFor("A")).toEqual(["123", "456"]);
    expect(bridgeFor("B")).toEqual(["555"]);
    expect(bridgeFor("C")).toEqual([]);
    expect(bridgeFor("D")).toEqual([]);
  });

  it("is idempotent when re-run", () => {
    db.insert(ticket).values({ jiraKey: "A", title: "A", status: "TO DO", sprintName: "1", sprintIds: JSON.stringify(["1", "2"]) }).run();
    runBackfill();
    runBackfill();
    expect(bridgeFor("A")).toEqual(["1", "2"]);
  });
});
