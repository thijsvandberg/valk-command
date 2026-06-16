// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

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

import { GET, PUT } from "./route";

async function put(body: unknown) {
  return PUT(
    new Request("http://localhost:3100/api/settings/my-jira-identity", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/my-jira-identity", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns null when no identity is stored", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.value).toBeNull();
  });

  it("round-trips a Jira identity through PUT then GET", async () => {
    currentUser = "user-a";
    const putRes = await put({ value: { accountId: "acc-123", email: "thijs@newstory.nl" } });
    expect(putRes.status).toBe(200);

    const data = await (await GET()).json();
    expect(data.value).toEqual({ accountId: "acc-123", email: "thijs@newstory.nl" });
  });

  it("accepts a null email (privacy-hidden)", async () => {
    currentUser = "user-a";
    await put({ value: { accountId: "acc-123", email: null } });
    const data = await (await GET()).json();
    expect(data.value).toEqual({ accountId: "acc-123", email: null });
  });

  it("isolates the identity per account", async () => {
    currentUser = "user-a";
    await put({ value: { accountId: "acc-a", email: null } });

    currentUser = "user-b";
    expect((await (await GET()).json()).value).toBeNull();

    currentUser = "user-a";
    expect((await (await GET()).json()).value).toEqual({ accountId: "acc-a", email: null });
  });

  it("rejects an identity without an accountId", async () => {
    const res = await put({ value: { accountId: "", email: null } });
    expect(res.status).toBe(400);
  });
});
