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

import {
  sanitizeColor,
  getEpicColorMap,
  sanitizeChildPlacement,
  getEpicChildPlacement,
} from "./epic-metadata";
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

describe("sanitizeChildPlacement", () => {
  it("accepts the backlog and default-sprint markers", () => {
    expect(sanitizeChildPlacement("__backlog__")).toBe("__backlog__");
    expect(sanitizeChildPlacement("__default__")).toBe("__default__");
  });

  it("accepts a concrete numeric sprint id", () => {
    expect(sanitizeChildPlacement("42")).toBe("42");
    expect(sanitizeChildPlacement("0")).toBe("0");
  });

  it("rejects off-shape and malformed values", () => {
    expect(sanitizeChildPlacement("sprint-42")).toBeNull();
    expect(sanitizeChildPlacement("1.5")).toBeNull();
    expect(sanitizeChildPlacement("-1")).toBeNull();
    expect(sanitizeChildPlacement("")).toBeNull();
    expect(sanitizeChildPlacement(42)).toBeNull();
    expect(sanitizeChildPlacement(null)).toBeNull();
    expect(sanitizeChildPlacement(undefined)).toBeNull();
  });
});

describe("getEpicChildPlacement", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when the epic has no placement set", () => {
    expect(getEpicChildPlacement("VPL-A")).toBeNull();
    testDb.insert(epicMetadata).values({ epicKey: "VPL-A", color: "#e05252" }).run();
    expect(getEpicChildPlacement("VPL-A")).toBeNull();
  });

  it("reads back a stored placement", () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-A", childPlacement: "42" }).run();
    testDb.insert(epicMetadata).values({ epicKey: "VPL-B", childPlacement: "__backlog__" }).run();
    expect(getEpicChildPlacement("VPL-A")).toBe("42");
    expect(getEpicChildPlacement("VPL-B")).toBe("__backlog__");
  });

  it("sanitizes a drifted stored value to null", () => {
    testDb.insert(epicMetadata).values({ epicKey: "VPL-A", childPlacement: "garbage" }).run();
    expect(getEpicChildPlacement("VPL-A")).toBeNull();
  });
});
