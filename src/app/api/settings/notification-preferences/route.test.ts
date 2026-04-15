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

vi.mock("server-only", () => ({}));

vi.mock("@/lib/notification-preferences", () => ({
  DEFAULT_PREFERENCES: {
    general: true,
    pipeline: true,
    deployment: true,
    pr: true,
    sync: false,
    "story-writer": true,
    system: true,
    agent: true,
    scheduler: true,
  },
  NOTIFICATION_PREFS_KEY: "notification_preferences",
  getPreferences: vi.fn().mockReturnValue({
    general: true,
    pipeline: true,
    deployment: true,
    pr: true,
    sync: false,
    "story-writer": true,
    system: true,
    agent: true,
    scheduler: true,
  }),
}));

import { GET, PUT } from "./route";
import { appSetting } from "@/db/schema";

describe("GET /api/settings/notification-preferences", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  it("returns current preferences", async () => {
    const { getPreferences } = await import("@/lib/notification-preferences");
    vi.mocked(getPreferences).mockReturnValue({
      general: true,
      pipeline: false,
      deployment: true,
      pr: true,
      sync: false,
      "story-writer": true,
      system: true,
      agent: true,
      scheduler: true,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.preferences).toBeDefined();
    expect(typeof data.preferences.general).toBe("boolean");
  });
});

describe("PUT /api/settings/notification-preferences", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves valid preferences and merges with defaults", async () => {
    const request = new Request("http://localhost:3100/api/settings/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences: { pipeline: false, sync: true } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.preferences.pipeline).toBe(false);
    expect(data.preferences.sync).toBe(true);
    // Defaults still present
    expect(data.preferences.general).toBe(true);
  });

  it("returns 400 for invalid preferences format", async () => {
    const request = new Request("http://localhost:3100/api/settings/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences: "not-an-object" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("updates existing preferences in the database", async () => {
    testDb.insert(appSetting).values({
      key: "notification_preferences",
      value: JSON.stringify({ pipeline: true }),
    }).run();

    const request = new Request("http://localhost:3100/api/settings/notification-preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences: { pipeline: false } }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.preferences.pipeline).toBe(false);
  });
});
