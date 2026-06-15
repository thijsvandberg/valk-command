// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
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

// resolveUserId (and the rate limiter) read the forwarded Clerk user from this
// header; controlling it lets us assert per-account isolation.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-bridge-user-id" ? currentUser : null),
  }),
}));

import { GET, PUT } from "./route";

function makeView(id: string, title: string) {
  return {
    id,
    title,
    filters: { status: ["To Do"], epic: [], assignee: [] },
    sort: { field: "rank", direction: "asc" },
  };
}

async function put(body: unknown) {
  return PUT(
    new Request("http://localhost:3100/api/settings/saved-views", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("/api/settings/saved-views", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  it("returns an empty list when nothing is stored", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.value).toEqual([]);
  });

  it("round-trips saved views through PUT then GET", async () => {
    currentUser = "user-a";
    const views = [makeView("v1", "To refine"), makeView("v2", "Overall")];
    const putRes = await put({ value: views });
    expect(putRes.status).toBe(200);

    const getRes = await GET();
    const data = await getRes.json();
    expect(data.value).toHaveLength(2);
    expect(data.value[0].title).toBe("To refine");
  });

  it("isolates views per account", async () => {
    currentUser = "user-a";
    await put({ value: [makeView("v1", "A only")] });

    currentUser = "user-b";
    const bEmpty = await (await GET()).json();
    expect(bEmpty.value).toEqual([]);

    await put({ value: [makeView("v2", "B only")] });
    const bViews = await (await GET()).json();
    expect(bViews.value).toHaveLength(1);
    expect(bViews.value[0].title).toBe("B only");

    currentUser = "user-a";
    const aViews = await (await GET()).json();
    expect(aViews.value[0].title).toBe("A only");
  });

  it("falls back to the global owner when no user is resolved", async () => {
    currentUser = null;
    await put({ value: [makeView("v1", "Global view")] });
    const data = await (await GET()).json();
    expect(data.value[0].title).toBe("Global view");
  });

  it("rejects a non-array value", async () => {
    const res = await put({ value: "not-an-array" });
    expect(res.status).toBe(400);
  });

  it("rejects a view missing a title", async () => {
    const res = await put({
      value: [{ id: "x", filters: {}, sort: { field: "rank", direction: "asc" } }],
    });
    expect(res.status).toBe(400);
  });

  it("preserves unknown legacy fields on a view", async () => {
    currentUser = "user-a";
    const legacy = {
      ...makeView("v1", "Legacy"),
      filters: { status: [], epic: [], assignee: [], poStatus: ["ready"] },
      columnConfig: { visible: ["key", "title"] },
    };
    await put({ value: [legacy] });
    const data = await (await GET()).json();
    expect(data.value[0].filters.poStatus).toEqual(["ready"]);
    expect(data.value[0].columnConfig.visible).toEqual(["key", "title"]);
  });
});
