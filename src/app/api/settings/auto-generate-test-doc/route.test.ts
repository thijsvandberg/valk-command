// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

import { GET, PUT } from "./route";
import { appSetting } from "@/db/schema";
import { AUTO_GENERATE_TEST_DOC_KEY } from "@/lib/auto-generate-test-doc-setting";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3101/api/settings/auto-generate-test-doc", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/settings/auto-generate-test-doc", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns { value: true } by default when no row exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.value).toBe(true);
  });

  it("returns the stored value after a PUT", async () => {
    testDb.insert(appSetting).values({ key: AUTO_GENERATE_TEST_DOC_KEY, value: "false" }).run();
    const response = await GET();
    const data = await response.json();
    expect(data.value).toBe(false);
  });
});

describe("PUT /api/settings/auto-generate-test-doc", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("persists { value: false } and returns it", async () => {
    const response = await PUT(makeRequest({ value: false }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.value).toBe(false);

    const row = testDb.select().from(appSetting).get();
    expect(row?.value).toBe("false");
  });

  it("persists { value: true } and returns it", async () => {
    const response = await PUT(makeRequest({ value: true }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.value).toBe(true);
  });

  it("overwrites a previously stored value", async () => {
    testDb.insert(appSetting).values({ key: AUTO_GENERATE_TEST_DOC_KEY, value: "true" }).run();

    await PUT(makeRequest({ value: false }));
    const response = await GET();
    const data = await response.json();
    expect(data.value).toBe(false);
  });

  it("returns 400 for an invalid body", async () => {
    const response = await PUT(makeRequest({ value: "not-a-boolean" }));
    expect(response.status).toBe(400);
  });
});
