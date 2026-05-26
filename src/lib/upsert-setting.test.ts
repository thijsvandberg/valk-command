// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { upsertSetting } from "./upsert-setting";

describe("upsertSetting", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("inserts a new setting", async () => {
    await upsertSetting("test_key", "test_value");
    const row = testDb.select().from(appSetting).where(eq(appSetting.key, "test_key")).get();
    expect(row?.value).toBe("test_value");
  });

  it("updates an existing setting", async () => {
    await upsertSetting("test_key", "first");
    await upsertSetting("test_key", "second");
    const row = testDb.select().from(appSetting).where(eq(appSetting.key, "test_key")).get();
    expect(row?.value).toBe("second");
  });

  it("does not affect other settings", async () => {
    await upsertSetting("key_a", "value_a");
    await upsertSetting("key_b", "value_b");
    const rows = testDb.select().from(appSetting).all();
    expect(rows).toHaveLength(2);
  });
});
