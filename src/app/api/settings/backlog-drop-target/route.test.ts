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
    new Request("http://localhost:3100/api/settings/backlog-drop-target", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/backlog-drop-target", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns the BT: Backlog default when nothing is stored", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.value).toBe("BT: Backlog");
  });

  it("round-trips the chosen backlog name through PUT then GET", async () => {
    currentUser = "user-a";
    const putRes = await put({ value: "GXP: Backlog" });
    expect(putRes.status).toBe(200);

    const data = await (await GET()).json();
    expect(data.value).toBe("GXP: Backlog");
  });

  it("isolates the target per account", async () => {
    currentUser = "user-a";
    await put({ value: "GXP: Backlog" });

    currentUser = "user-b";
    const bDefault = await (await GET()).json();
    expect(bDefault.value).toBe("BT: Backlog");

    await put({ value: "HT: Backlog" });
    const bValue = await (await GET()).json();
    expect(bValue.value).toBe("HT: Backlog");

    currentUser = "user-a";
    const aValue = await (await GET()).json();
    expect(aValue.value).toBe("GXP: Backlog");
  });

  it("falls back to the global owner when no user is resolved", async () => {
    currentUser = null;
    await put({ value: "BO: Backlog" });
    const data = await (await GET()).json();
    expect(data.value).toBe("BO: Backlog");
  });

  it("rejects a non-string value", async () => {
    const res = await put({ value: 123 });
    expect(res.status).toBe(400);
  });
});
