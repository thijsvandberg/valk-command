// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, favoriteUser, userTeamAssignment } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

describe("GET /api/jira/assignable-users", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty users array when no tickets have assignees", async () => {
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.users).toEqual([]);
  });

  it("returns distinct assignees sorted case-insensitive with computed initials", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice Smith" },
      { jiraKey: "VPL-2", title: "T2", status: "TO DO", assignee: "bob" },
      { jiraKey: "VPL-3", title: "T3", status: "TO DO", assignee: "Alice Smith" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users).toHaveLength(2);
    expect(data.users[0].displayName).toBe("Alice Smith");
    expect(data.users[0].initials).toBe("AS");
    expect(data.users[1].displayName).toBe("bob");
    expect(data.users[1].initials).toBe("BO");
  });

  it("emits the sync-captured accountId, preferring a non-null id across rows", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice Smith", assigneeAccountId: null },
      { jiraKey: "VPL-2", title: "T2", status: "TO DO", assignee: "Alice Smith", assigneeAccountId: "acc-alice" },
      { jiraKey: "VPL-3", title: "T3", status: "TO DO", assignee: "Bob Jones" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    const alice = data.users.find((u: { displayName: string }) => u.displayName === "Alice Smith");
    const bob = data.users.find((u: { displayName: string }) => u.displayName === "Bob Jones");
    expect(alice.accountId).toBe("acc-alice");
    expect(bob.accountId).toBeNull();
  });

  it("computes two-char initials for single-word name", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice",
    }).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users[0].initials).toBe("AL");
  });

  it("enriches with isFavorite from favoriteUser table", async () => {
    testDb.insert(ticket).values([
      { jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice Smith" },
      { jiraKey: "VPL-2", title: "T2", status: "TO DO", assignee: "Bob Jones" },
    ]).run();
    testDb.insert(favoriteUser).values({ id: "fav-1", displayName: "Alice Smith" }).run();

    const res = await GET();
    const data = await res.json();
    const alice = data.users.find((u: { displayName: string }) => u.displayName === "Alice Smith");
    const bob = data.users.find((u: { displayName: string }) => u.displayName === "Bob Jones");
    expect(alice.isFavorite).toBe(true);
    expect(bob.isFavorite).toBe(false);
  });

  it("enriches with teams from userTeamAssignment table", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice Smith",
    }).run();
    testDb.insert(userTeamAssignment).values([
      { id: "uta-1", displayName: "Alice Smith", team: "BT" },
      { id: "uta-2", displayName: "Alice Smith", team: "BM" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users[0].teams).toEqual(expect.arrayContaining(["BT", "BM"]));
  });

  it("matches a favourite by accountId after the display name changed (rename)", async () => {
    // Ticket carries the renamed display name + stable accountId; favourite was
    // saved under the old name but with the accountId (BRDG-364).
    testDb.insert(ticket).values({
      jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Thijs vd Berg", assigneeAccountId: "acc-thijs",
    }).run();
    testDb.insert(favoriteUser).values({ id: "fav-1", displayName: "Thijs van den Berg", accountId: "acc-thijs" }).run();

    const res = await GET();
    const data = await res.json();
    const thijs = data.users.find((u: { displayName: string }) => u.displayName === "Thijs vd Berg");
    expect(thijs.isFavorite).toBe(true);
  });

  it("matches team assignments by accountId after a rename", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Thijs vd Berg", assigneeAccountId: "acc-thijs",
    }).run();
    testDb.insert(userTeamAssignment).values([
      { id: "uta-1", displayName: "Thijs van den Berg", accountId: "acc-thijs", team: "BT" },
    ]).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users[0].teams).toEqual(["BT"]);
  });

  it("still matches a name-only favourite (no accountId) by name", async () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-1", title: "T1", status: "TO DO", assignee: "Alice Smith", assigneeAccountId: "acc-alice",
    }).run();
    testDb.insert(favoriteUser).values({ id: "fav-1", displayName: "Alice Smith", accountId: null }).run();

    const res = await GET();
    const data = await res.json();
    expect(data.users[0].isFavorite).toBe(true);
  });

  it("returns empty users array when tickets table is empty", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.users).toEqual([]);
  });

  it("returns 500 with empty users array on exception", async () => {
    const { sql } = await import("drizzle-orm");
    testDb.run(sql.raw("DROP TABLE ticket"));

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.users).toEqual([]);
    expect(data.error).toBeDefined();
  });
});
