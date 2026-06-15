// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { readUserSetting, writeUserSetting } from "./user-settings";

describe("user-settings store", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null for an unset key", async () => {
    expect(await readUserSetting("k", "user-a")).toBeNull();
  });

  it("writes and reads back a value for an owner", async () => {
    await writeUserSetting("k", "user-a", "hello");
    expect(await readUserSetting("k", "user-a")).toBe("hello");
  });

  it("keeps values isolated per owner", async () => {
    await writeUserSetting("k", "user-a", "a-value");
    await writeUserSetting("k", "user-b", "b-value");
    expect(await readUserSetting("k", "user-a")).toBe("a-value");
    expect(await readUserSetting("k", "user-b")).toBe("b-value");
  });

  it("upserts on repeated writes for the same owner+key", async () => {
    await writeUserSetting("k", "user-a", "first");
    await writeUserSetting("k", "user-a", "second");
    expect(await readUserSetting("k", "user-a")).toBe("second");
  });

  it("treats the same key under different owners as separate rows", async () => {
    await writeUserSetting("shared", "global", "g");
    await writeUserSetting("shared", "user-a", "a");
    expect(await readUserSetting("shared", "global")).toBe("g");
    expect(await readUserSetting("shared", "user-a")).toBe("a");
  });
});
