// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET, POST } from "./route";
import {
  AUTO_SCAN_ENABLED_KEY,
  AUTO_SCAN_DAILY_COUNT_KEY,
} from "./route";

function get(): Promise<Response> {
  return GET();
}

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost:3100/api/cleanup/auto-scan-settings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }));
}

describe("GET /api/cleanup/auto-scan-settings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns defaults when no settings are stored", async () => {
    const data = await (await get()).json();
    expect(data).toEqual({ enabled: false, dailyCount: 10 });
  });

  it("returns stored values when settings have been saved", async () => {
    testDb.insert(appSetting).values({ key: AUTO_SCAN_ENABLED_KEY, value: "true" }).run();
    testDb.insert(appSetting).values({ key: AUTO_SCAN_DAILY_COUNT_KEY, value: "25" }).run();
    const data = await (await get()).json();
    expect(data).toEqual({ enabled: true, dailyCount: 25 });
  });
});

describe("POST /api/cleanup/auto-scan-settings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("rejects an invalid body", async () => {
    const res = await post({ dailyCount: -5 });
    expect(res.status).toBe(400);
  });

  it("enables auto scan and sets daily count", async () => {
    const data = await (await post({ enabled: true, dailyCount: 20 })).json();
    expect(data.enabled).toBe(true);
    expect(data.dailyCount).toBe(20);

    const storedEnabled = testDb
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, AUTO_SCAN_ENABLED_KEY))
      .get();
    expect(storedEnabled?.value).toBe("true");
  });

  it("partial update only changes supplied fields", async () => {
    // Seed an existing daily-count so we can verify it is unchanged.
    testDb.insert(appSetting).values({ key: AUTO_SCAN_DAILY_COUNT_KEY, value: "15" }).run();
    await post({ enabled: true });
    const data = await (await get()).json();
    expect(data.enabled).toBe(true);
    // dailyCount should remain at the previously seeded 15.
    expect(data.dailyCount).toBe(15);
  });

  it("disables auto scan", async () => {
    testDb.insert(appSetting).values({ key: AUTO_SCAN_ENABLED_KEY, value: "true" }).run();
    const data = await (await post({ enabled: false })).json();
    expect(data.enabled).toBe(false);
  });
});
