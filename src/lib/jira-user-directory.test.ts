// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { jiraUser } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { getJiraUserLookup } from "./jira-user-directory";

describe("getJiraUserLookup", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(jiraUser).values([
      { accountId: "acc-1", displayName: "Thijs", email: "thijs@newstory.nl", avatar: "thijs.png", updatedAt: "2026-01-01T00:00:00.000Z" },
      { accountId: "acc-2", displayName: "Robin", email: null, avatar: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]).run();
  });

  it("returns the label for a known accountId", async () => {
    const lookup = await getJiraUserLookup(["acc-1"]);
    expect(lookup("acc-1")).toEqual({ displayName: "Thijs", email: "thijs@newstory.nl", avatar: "thijs.png" });
  });

  it("returns undefined for an unknown accountId", async () => {
    const lookup = await getJiraUserLookup(["acc-1"]);
    expect(lookup("acc-999")).toBeUndefined();
  });

  it("ignores null/undefined ids and short-circuits when none remain", async () => {
    const lookup = await getJiraUserLookup([null, undefined]);
    expect(lookup("acc-1")).toBeUndefined();
  });

  it("batches multiple ids into one map", async () => {
    const lookup = await getJiraUserLookup(["acc-1", "acc-2", null]);
    expect(lookup("acc-1")?.displayName).toBe("Thijs");
    expect(lookup("acc-2")?.displayName).toBe("Robin");
  });
});
