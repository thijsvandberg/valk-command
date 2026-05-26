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

describe("GET /api/settings/default-sprint", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty sprintId when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprintId).toBe("");
  });

  it("returns stored sprintId when setting exists", async () => {
    testDb.insert(appSetting).values({
      key: "default_sprint_id",
      value: "12345",
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprintId).toBe("12345");
  });
});

describe("PUT /api/settings/default-sprint", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves a valid sprintId", async () => {
    const request = new Request("http://localhost:3100/api/settings/default-sprint", {
      method: "PUT",
      body: JSON.stringify({ sprintId: "99999" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprintId).toBe("99999");
  });

  it("updates existing setting", async () => {
    testDb.insert(appSetting).values({
      key: "default_sprint_id",
      value: "old-sprint",
    }).run();

    const request = new Request("http://localhost:3100/api/settings/default-sprint", {
      method: "PUT",
      body: JSON.stringify({ sprintId: "new-sprint" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprintId).toBe("new-sprint");
  });

  it("returns 400 for invalid body", async () => {
    const request = new Request("http://localhost:3100/api/settings/default-sprint", {
      method: "PUT",
      body: JSON.stringify({ wrong: "field" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("saves empty string to clear setting", async () => {
    testDb.insert(appSetting).values({
      key: "default_sprint_id",
      value: "some-sprint",
    }).run();

    const request = new Request("http://localhost:3100/api/settings/default-sprint", {
      method: "PUT",
      body: JSON.stringify({ sprintId: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sprintId).toBe("");
  });
});
