// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting, sprintNameCache } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getSubscribedTeams,
  setSubscribedTeams,
  getAvailableTeams,
  SUBSCRIBED_TEAMS_KEY,
} from "./subscribed-teams";

describe("subscribed-teams", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  describe("getSubscribedTeams", () => {
    it("returns teams array when setting exists", () => {
      testDb.insert(appSetting).values({
        key: SUBSCRIBED_TEAMS_KEY,
        value: JSON.stringify({ teams: ["BT", "HT"] }),
      }).run();

      expect(getSubscribedTeams()).toEqual(["BT", "HT"]);
    });

    it("returns empty array if setting not found", () => {
      expect(getSubscribedTeams()).toEqual([]);
    });

    it("returns empty array for malformed JSON", () => {
      testDb.insert(appSetting).values({
        key: SUBSCRIBED_TEAMS_KEY,
        value: "not-json",
      }).run();

      expect(getSubscribedTeams()).toEqual([]);
    });

    it("returns empty array if teams is not an array", () => {
      testDb.insert(appSetting).values({
        key: SUBSCRIBED_TEAMS_KEY,
        value: JSON.stringify({ teams: "BT" }),
      }).run();

      expect(getSubscribedTeams()).toEqual([]);
    });
  });

  describe("setSubscribedTeams", () => {
    it("inserts new record when none exists", () => {
      setSubscribedTeams(["BT", "HT"]);
      const row = testDb.select().from(appSetting)
        .where(eq(appSetting.key, SUBSCRIBED_TEAMS_KEY)).get();
      expect(JSON.parse(row!.value)).toEqual({ teams: ["BT", "HT"] });
    });

    it("updates existing record", () => {
      setSubscribedTeams(["BT"]);
      setSubscribedTeams(["BT", "HT", "BM"]);
      const row = testDb.select().from(appSetting)
        .where(eq(appSetting.key, SUBSCRIBED_TEAMS_KEY)).get();
      expect(JSON.parse(row!.value)).toEqual({ teams: ["BT", "HT", "BM"] });
    });

    it("persists empty array", () => {
      setSubscribedTeams(["BT"]);
      setSubscribedTeams([]);
      expect(getSubscribedTeams()).toEqual([]);
    });
  });

  describe("getAvailableTeams", () => {
    it("extracts team prefixes from sprint name cache", () => {
      testDb.insert(sprintNameCache).values([
        { sprintId: 1, displayName: "BT: Sprint 1" },
        { sprintId: 2, displayName: "HT: Sprint 1" },
        { sprintId: 3, displayName: "BT: Sprint 2" },
      ]).run();

      expect(getAvailableTeams()).toEqual(["BT", "HT"]);
    });

    it("returns empty array when no sprints cached", () => {
      expect(getAvailableTeams()).toEqual([]);
    });

    it("ignores sprint names without colon separator", () => {
      testDb.insert(sprintNameCache).values([
        { sprintId: 1, displayName: "No Prefix Sprint" },
        { sprintId: 2, displayName: "BT: Sprint 1" },
      ]).run();

      expect(getAvailableTeams()).toEqual(["BT"]);
    });
  });
});
