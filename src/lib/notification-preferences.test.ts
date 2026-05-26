// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));

import {
  getPreferences,
  DEFAULT_PREFERENCES,
  NOTIFICATION_PREFS_KEY,
} from "./notification-preferences";

describe("getPreferences", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns DEFAULT_PREFERENCES when no row exists", () => {
    const prefs = getPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it("merges stored preferences with defaults", () => {
    testDb.insert(appSetting).values({
      key: NOTIFICATION_PREFS_KEY,
      value: JSON.stringify({ pipeline: false, sync: true }),
    }).run();

    const prefs = getPreferences();
    expect(prefs.pipeline).toBe(false);
    expect(prefs.sync).toBe(true);
    expect(prefs.general).toBe(true);
  });

  it("returns defaults when stored value is invalid JSON", () => {
    testDb.insert(appSetting).values({
      key: NOTIFICATION_PREFS_KEY,
      value: "not-json{",
    }).run();

    const prefs = getPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it("DEFAULT_PREFERENCES has all notification categories", () => {
    const categories = [
      "general", "pipeline", "deployment", "pr", "sync",
      "story-writer", "system", "agent", "scheduler",
    ];
    for (const cat of categories) {
      expect(DEFAULT_PREFERENCES).toHaveProperty(cat);
    }
  });
});
