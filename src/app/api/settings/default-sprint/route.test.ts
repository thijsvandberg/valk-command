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

describe("/api/settings/default-sprint per-account scoping (BRDG-343)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
  });

  function put(sprintId: string) {
    return PUT(
      new Request("http://localhost:3100/api/settings/default-sprint", {
        method: "PUT",
        body: JSON.stringify({ sprintId }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("seeds each account from the legacy global appSetting on first read", async () => {
    testDb.insert(appSetting).values({ key: "default_sprint_id", value: "legacy" }).run();

    currentUser = "user-a";
    expect((await (await GET()).json()).sprintId).toBe("legacy");

    currentUser = "user-b";
    expect((await (await GET()).json()).sprintId).toBe("legacy");
  });

  it("keeps the two accounts fully isolated after a write", async () => {
    testDb.insert(appSetting).values({ key: "default_sprint_id", value: "legacy" }).run();

    currentUser = "user-a";
    await put("a-sprint");

    currentUser = "user-b";
    // user-b still seeds the untouched legacy value, not user-a's write.
    expect((await (await GET()).json()).sprintId).toBe("legacy");
    await put("b-sprint");

    currentUser = "user-a";
    expect((await (await GET()).json()).sprintId).toBe("a-sprint");
  });
});
