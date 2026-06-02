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

import { sanitizeColor, getEpicColorMap } from "./epic-metadata";
import { epicMetadata } from "@/db/schema";

describe("sanitizeColor", () => {
  it("accepts a curated palette base hex", () => {
    expect(sanitizeColor("#e05252")).toBe("#e05252");
    expect(sanitizeColor("#9b6cd4")).toBe("#9b6cd4");
  });

  it("is case-insensitive on the hex", () => {
    expect(sanitizeColor("#E05252")).toBe("#E05252");
  });

  it("rejects off-palette and malformed values", () => {
    expect(sanitizeColor("#123456")).toBeNull();
    expect(sanitizeColor("red")).toBeNull();
    expect(sanitizeColor("")).toBeNull();
    expect(sanitizeColor(42)).toBeNull();
    expect(sanitizeColor(null)).toBeNull();
    expect(sanitizeColor(undefined)).toBeNull();
  });
});

describe("getEpicColorMap", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns an empty map for no keys", () => {
    expect(getEpicColorMap([]).size).toBe(0);
  });

  it("maps only epics that have a color set", () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-A", color: "#e05252" }).run();
    testDb.insert(epicMetadata).values({ epicKey: "VPL-B", teams: JSON.stringify(["BT"]) }).run();

    const map = getEpicColorMap(["VPL-A", "VPL-B", "VPL-C"]);
    expect(map.get("VPL-A")).toBe("#e05252");
    expect(map.has("VPL-B")).toBe(false);
    expect(map.has("VPL-C")).toBe(false);
  });
});
