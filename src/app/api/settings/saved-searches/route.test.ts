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

const emptyFilters = {
  sections: [],
  status: [],
  poStatus: [],
  type: [],
  assignee: [],
  sprint: [],
  dateRange: null,
};

const sampleSearch = {
  id: "abc123",
  label: "My search",
  query: "auth bug",
  filters: emptyFilters,
};

describe("GET /api/settings/saved-searches", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty array when no setting exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.searches).toEqual([]);
  });

  it("returns stored searches when setting exists", async () => {
    testDb
      .insert(appSetting)
      .values({ key: "saved_searches", value: JSON.stringify([sampleSearch]) })
      .run();

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.searches).toHaveLength(1);
    expect(data.searches[0].id).toBe("abc123");
  });
});

describe("PUT /api/settings/saved-searches", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("saves valid searches", async () => {
    const request = new Request("http://localhost:3100/api/settings/saved-searches", {
      method: "PUT",
      body: JSON.stringify({ searches: [sampleSearch] }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.searches[0].id).toBe("abc123");
  });

  it("returns 400 for invalid format", async () => {
    const request = new Request("http://localhost:3100/api/settings/saved-searches", {
      method: "PUT",
      body: JSON.stringify({ searches: "not-an-array" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/Invalid/i);
  });

  it("returns 400 when exceeding max 10 entries", async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({
      ...sampleSearch,
      id: `id-${i}`,
    }));
    const request = new Request("http://localhost:3100/api/settings/saved-searches", {
      method: "PUT",
      body: JSON.stringify({ searches: tooMany }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when label is empty", async () => {
    const request = new Request("http://localhost:3100/api/settings/saved-searches", {
      method: "PUT",
      body: JSON.stringify({ searches: [{ ...sampleSearch, label: "" }] }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it("updates existing row (upsert)", async () => {
    testDb
      .insert(appSetting)
      .values({ key: "saved_searches", value: JSON.stringify([sampleSearch]) })
      .run();

    const updated = { ...sampleSearch, id: "new-id", label: "Updated" };
    const request = new Request("http://localhost:3100/api/settings/saved-searches", {
      method: "PUT",
      body: JSON.stringify({ searches: [updated] }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.searches[0].id).toBe("new-id");
  });
});

describe("/api/settings/saved-searches per-account scoping (BRDG-343)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  function put(searches: unknown) {
    return PUT(
      new Request("http://localhost:3100/api/settings/saved-searches", {
        method: "PUT",
        body: JSON.stringify({ searches }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("seeds an account from the legacy global searches on first read", async () => {
    testDb
      .insert(appSetting)
      .values({ key: "saved_searches", value: JSON.stringify([sampleSearch]) })
      .run();

    currentUser = "user-a";
    const data = await (await GET()).json();
    expect(data.searches).toHaveLength(1);
    expect(data.searches[0].id).toBe("abc123");
  });

  it("isolates one account's searches from another", async () => {
    currentUser = "user-a";
    await put([{ ...sampleSearch, id: "a-only" }]);

    currentUser = "user-b";
    expect((await (await GET()).json()).searches).toEqual([]);
    await put([{ ...sampleSearch, id: "b-only" }]);

    currentUser = "user-a";
    expect((await (await GET()).json()).searches[0].id).toBe("a-only");
  });
});
