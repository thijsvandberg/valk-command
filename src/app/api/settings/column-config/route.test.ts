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

describe("GET /api/settings/column-config", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns { order: null, visible: null } when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ order: null, visible: null });
  });

  it("returns stored config when setting exists", async () => {
    const config = { order: ["col-a", "col-b"], visible: ["col-a"] };
    testDb.insert(appSetting).values({
      key: "sprint_board_column_config",
      value: JSON.stringify(config),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.order).toEqual(["col-a", "col-b"]);
    expect(data.visible).toEqual(["col-a"]);
  });
});

describe("PUT /api/settings/column-config", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("inserts new config when none exists", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-config", {
      method: "PUT",
      body: JSON.stringify({ order: ["col-1", "col-2"], visible: ["col-1"] }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.order).toEqual(["col-1", "col-2"]);
    expect(data.visible).toEqual(["col-1"]);
  });

  it("returns 400 when order is not an array", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-config", {
      method: "PUT",
      body: JSON.stringify({ order: "not-an-array" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("updates existing config", async () => {
    testDb.insert(appSetting).values({
      key: "sprint_board_column_config",
      value: JSON.stringify({ order: ["old"], visible: ["old"] }),
    }).run();

    const request = new Request("http://localhost:3100/api/settings/column-config", {
      method: "PUT",
      body: JSON.stringify({ order: ["new"] }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.order).toEqual(["new"]);
    // visible unchanged from stored value
    expect(data.visible).toEqual(["old"]);
  });

  it("returns 400 when visible is not an array", async () => {
    const request = new Request("http://localhost:3100/api/settings/column-config", {
      method: "PUT",
      body: JSON.stringify({ visible: 42 }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });
});
