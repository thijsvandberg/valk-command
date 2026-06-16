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
    new Request("http://localhost:3100/api/settings/default-team", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/default-team", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns null when nothing is stored", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.value).toBeNull();
  });

  it("round-trips a chosen team through PUT then GET", async () => {
    currentUser = "user-a";
    const putRes = await put({ value: "GXP" });
    expect(putRes.status).toBe(200);

    const data = await (await GET()).json();
    expect(data.value).toBe("GXP");
  });

  it("clears the team back to null", async () => {
    currentUser = "user-a";
    await put({ value: "BT" });
    await put({ value: null });
    const data = await (await GET()).json();
    expect(data.value).toBeNull();
  });

  it("isolates the team per account", async () => {
    currentUser = "user-a";
    await put({ value: "GXP" });

    currentUser = "user-b";
    const bDefault = await (await GET()).json();
    expect(bDefault.value).toBeNull();

    await put({ value: "HT" });

    currentUser = "user-a";
    const aValue = await (await GET()).json();
    expect(aValue.value).toBe("GXP");
  });

  it("rejects a team code outside the fixed set", async () => {
    const res = await put({ value: "NOPE" });
    expect(res.status).toBe(400);
  });
});
