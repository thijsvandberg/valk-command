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
    new Request("http://localhost:3100/api/settings/inbox-last-viewed", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/inbox-last-viewed", () => {
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

  it("round-trips an ISO timestamp through PUT then GET", async () => {
    currentUser = "user-a";
    const iso = "2026-06-25T08:30:00.000Z";
    const putRes = await put({ value: iso });
    expect(putRes.status).toBe(200);

    const data = await (await GET()).json();
    expect(data.value).toBe(iso);
  });

  it("clears the timestamp back to null", async () => {
    currentUser = "user-a";
    await put({ value: "2026-06-25T08:30:00.000Z" });
    await put({ value: null });
    const data = await (await GET()).json();
    expect(data.value).toBeNull();
  });

  it("isolates the timestamp per account", async () => {
    currentUser = "user-a";
    await put({ value: "2026-06-25T08:30:00.000Z" });

    currentUser = "user-b";
    const bDefault = await (await GET()).json();
    expect(bDefault.value).toBeNull();
  });

  it("rejects a non-datetime string", async () => {
    const res = await put({ value: "yesterday" });
    expect(res.status).toBe(400);
  });
});
