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

import { GET, PUT } from "./route";
import { appSetting } from "@/db/schema";

describe("GET /api/settings/column-widths", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns { widths: {} } when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ widths: {} });
  });

  it("returns stored widths when setting exists", async () => {
    testDb.insert(appSetting).values({
      key: "sprint_board_column_widths",
      value: JSON.stringify({ col1: 150, col2: 200 }),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.widths).toEqual({ col1: 150, col2: 200 });
  });
});

describe("PUT /api/settings/column-widths", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("inserts widths when none exists", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-widths", {
      method: "PUT",
      body: JSON.stringify({ widths: { col1: 100 } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.widths).toEqual({ col1: 100 });
  });

  it("returns 400 when widths is not an object", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-widths", {
      method: "PUT",
      body: JSON.stringify({ widths: null }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("updates existing widths", async () => {
    testDb.insert(appSetting).values({
      key: "sprint_board_column_widths",
      value: JSON.stringify({ col1: 100 }),
    }).run();

    const request = new Request("http://localhost:3100/api/settings/column-widths", {
      method: "PUT",
      body: JSON.stringify({ widths: { col1: 200, col2: 300 } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.widths).toEqual({ col1: 200, col2: 300 });
  });

  it("returns the saved widths in the response", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-widths", {
      method: "PUT",
      body: JSON.stringify({ widths: { summary: 250 } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    const data = await response.json();
    expect(data.widths.summary).toBe(250);
  });
});
