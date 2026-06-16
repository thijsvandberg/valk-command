// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { favoriteUser, userTeamAssignment, jiraUser } from "@/db/schema";
import { backfillPeopleAccountIds } from "./people-accountid-backfill";

let testDb: BetterSQLite3Database<typeof schema>;

describe("backfillPeopleAccountIds", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(jiraUser).values([
      { accountId: "acc-thijs", displayName: "Thijs van den Berg", email: null, avatar: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]).run();
  });

  it("fills the accountId of a favourite whose name matches a jira_user", () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Thijs van den Berg", accountId: null }).run();

    const result = backfillPeopleAccountIds(testDb);

    expect(result.favourites).toBe(1);
    expect(testDb.select().from(favoriteUser).all()[0].accountId).toBe("acc-thijs");
  });

  it("fills the accountId across all team rows for a matching name", () => {
    testDb.insert(userTeamAssignment).values([
      { id: "1", displayName: "Thijs van den Berg", accountId: null, team: "BT" },
      { id: "2", displayName: "Thijs van den Berg", accountId: null, team: "BM" },
    ]).run();

    const result = backfillPeopleAccountIds(testDb);

    expect(result.teams).toBe(2);
    expect(testDb.select().from(userTeamAssignment).all().every((r) => r.accountId === "acc-thijs")).toBe(true);
  });

  it("leaves a name-only row untouched when no jira_user matches", () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Unknown Person", accountId: null }).run();

    const result = backfillPeopleAccountIds(testDb);

    expect(result.favourites).toBe(0);
    expect(testDb.select().from(favoriteUser).all()[0].accountId).toBeNull();
  });

  it("does not overwrite an accountId that is already set", () => {
    testDb.insert(favoriteUser).values({ id: "1", displayName: "Thijs van den Berg", accountId: "acc-existing" }).run();

    const result = backfillPeopleAccountIds(testDb);

    expect(result.favourites).toBe(0);
    expect(testDb.select().from(favoriteUser).all()[0].accountId).toBe("acc-existing");
  });
});
