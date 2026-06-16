// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { userSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;
let currentUser: string | null = null;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-bridge-user-id" ? currentUser : null),
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

import { getActingUserJiraIdentity } from "./acting-user";

function seedIdentity(userId: string, value: unknown) {
  testDb.insert(userSetting).values({ userId, key: "my_jira_identity", value: JSON.stringify(value) }).run();
}

describe("getActingUserJiraIdentity", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns null when no user is in scope", async () => {
    expect(await getActingUserJiraIdentity()).toBeNull();
  });

  it("returns null when the user has recorded no identity", async () => {
    currentUser = "user-a";
    expect(await getActingUserJiraIdentity()).toBeNull();
  });

  it("returns the stored accountId and email", async () => {
    currentUser = "user-a";
    seedIdentity("user-a", { accountId: "acc-123", email: "thijs@newstory.nl" });
    expect(await getActingUserJiraIdentity()).toEqual({ accountId: "acc-123", email: "thijs@newstory.nl" });
  });

  it("normalises a missing email to null", async () => {
    currentUser = "user-a";
    seedIdentity("user-a", { accountId: "acc-123" });
    expect(await getActingUserJiraIdentity()).toEqual({ accountId: "acc-123", email: null });
  });

  it("returns null for a malformed stored value", async () => {
    currentUser = "user-a";
    seedIdentity("user-a", { email: "no-account@newstory.nl" });
    expect(await getActingUserJiraIdentity()).toBeNull();
  });
});
