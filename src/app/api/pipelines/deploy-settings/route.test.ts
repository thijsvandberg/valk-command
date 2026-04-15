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

describe("GET /api/pipelines/deploy-settings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns default settings when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.enabled).toBe(true);
    expect(data.environments).toBeDefined();
    expect(data.environments.Production).toBe(true);
    expect(data.environments.Test).toBe(false);
  });

  it("returns stored settings when they exist", async () => {
    const custom = { enabled: false, environments: { Production: false } };
    testDb.insert(appSetting).values({
      key: "deploy-notification-settings",
      value: JSON.stringify(custom),
    }).run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.enabled).toBe(false);
    expect(data.environments.Production).toBe(false);
  });
});

describe("PUT /api/pipelines/deploy-settings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves new deploy settings", async () => {
    const settings = { enabled: true, environments: { Production: true, Staging: false } };
    const request = new Request("http://localhost:3100/api/pipelines/deploy-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.enabled).toBe(true);
    expect(data.environments.Staging).toBe(false);
  });

  it("updates existing deploy settings", async () => {
    testDb.insert(appSetting).values({
      key: "deploy-notification-settings",
      value: JSON.stringify({ enabled: true, environments: { Production: true } }),
    }).run();

    const updated = { enabled: false, environments: { Production: false } };
    const request = new Request("http://localhost:3100/api/pipelines/deploy-settings", {
      method: "PUT",
      body: JSON.stringify(updated),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.enabled).toBe(false);

    // Verify the value is actually persisted in the DB
    const row = testDb.select().from(appSetting).all()
      .find((r) => r.key === "deploy-notification-settings");
    expect(row).toBeDefined();
    const stored = JSON.parse(row!.value);
    expect(stored.enabled).toBe(false);
  });

  it("returns the saved settings in the response", async () => {
    const settings = { enabled: true, environments: { UAT1: true } };
    const request = new Request("http://localhost:3100/api/pipelines/deploy-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    const data = await response.json();
    expect(data).toEqual(settings);
  });
});
