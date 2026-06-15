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

import { appSetting } from "@/db/schema";
import { readUserSetting, writeUserSetting, seedUserSettingFromGlobal } from "./user-settings";

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

describe("seedUserSettingFromGlobal", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when neither a per-account nor a global value exists", async () => {
    expect(await seedUserSettingFromGlobal("k", "user-a")).toBeNull();
  });

  it("seeds the per-account value from the legacy global appSetting on first read", async () => {
    testDb.insert(appSetting).values({ key: "k", value: "legacy" }).run();
    expect(await seedUserSettingFromGlobal("k", "user-a")).toBe("legacy");
    // The seed is persisted so a later direct read returns it.
    expect(await readUserSetting("k", "user-a")).toBe("legacy");
  });

  it("does not mutate the global row when seeding", async () => {
    testDb.insert(appSetting).values({ key: "k", value: "legacy" }).run();
    await seedUserSettingFromGlobal("k", "user-a");
    const row = await testDb.query.appSetting.findFirst({ where: (r, { eq }) => eq(r.key, "k") });
    expect(row?.value).toBe("legacy");
  });

  it("returns the per-account value and never reseeds once one exists", async () => {
    testDb.insert(appSetting).values({ key: "k", value: "legacy" }).run();
    await writeUserSetting("k", "user-a", "mine");
    expect(await seedUserSettingFromGlobal("k", "user-a")).toBe("mine");
  });

  it("seeds each account independently from the same global row", async () => {
    testDb.insert(appSetting).values({ key: "k", value: "legacy" }).run();
    expect(await seedUserSettingFromGlobal("k", "user-a")).toBe("legacy");
    await writeUserSetting("k", "user-a", "a-changed");
    // user-b still seeds from the untouched global value.
    expect(await seedUserSettingFromGlobal("k", "user-b")).toBe("legacy");
    expect(await readUserSetting("k", "user-a")).toBe("a-changed");
  });
});
