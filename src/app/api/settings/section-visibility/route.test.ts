// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
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

// resolveUserId reads the forwarded Clerk user from this header; controlling it
// lets us assert per-account isolation and the appSetting -> userSetting seed.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-bridge-user-id" ? currentUser : null),
  }),
}));

import { GET, PUT } from "./route";
import { appSetting } from "@/db/schema";

function get(section: string | null) {
  const url = section
    ? `http://localhost:3100/api/settings/section-visibility?section=${section}`
    : "http://localhost:3100/api/settings/section-visibility";
  return GET(new Request(url));
}

function put(body: unknown) {
  return PUT(
    new Request("http://localhost:3100/api/settings/section-visibility", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/section-visibility", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns null visible for an unknown section", async () => {
    const data = await (await get("bogus")).json();
    expect(data.visible).toBeNull();
  });

  it("returns null visible when nothing is stored for a valid section", async () => {
    const data = await (await get("subtasks")).json();
    expect(data.visible).toBeNull();
  });

  it("round-trips a section's visibility through PUT then GET", async () => {
    const res = await put({ section: "subtasks", visible: ["title"], allKnown: ["title", "key"] });
    expect(res.status).toBe(200);

    const data = await (await get("subtasks")).json();
    expect(data.visible).toEqual(["title"]);
    expect(data.allKnown).toEqual(["title", "key"]);
  });

  it("rejects an invalid section on PUT", async () => {
    const res = await put({ section: "bogus", visible: [] });
    expect(res.status).toBe(400);
  });

  it("seeds a section from the legacy global value on first read", async () => {
    testDb
      .insert(appSetting)
      .values({
        key: "section_visibility_subtasks",
        value: JSON.stringify({ visible: ["legacy"], allKnown: ["legacy"] }),
      })
      .run();

    currentUser = "user-a";
    const data = await (await get("subtasks")).json();
    expect(data.visible).toEqual(["legacy"]);
  });

  it("isolates section visibility per account", async () => {
    currentUser = "user-a";
    await put({ section: "subtasks", visible: ["a"], allKnown: ["a"] });

    currentUser = "user-b";
    expect((await (await get("subtasks")).json()).visible).toBeNull();
  });
});
