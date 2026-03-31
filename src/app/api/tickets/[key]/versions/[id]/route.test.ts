import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, storyVersion } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { PUT } from "./route";

function seed(db: BetterSQLite3Database<typeof schema>) {
  db.insert(ticket)
    .values({ jiraKey: "VPL-100", title: "Test", status: "TO DO" })
    .run();
  db.insert(storyVersion)
    .values({
      id: "sv-1",
      jiraKey: "VPL-100",
      description: "Desc",
      contentHash: "abc",
    })
    .run();
}

function makeParams(key: string, id: string) {
  return { params: Promise.resolve({ key, id }) };
}

describe("PUT /api/tickets/[key]/versions/[id]", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("updates the tag on a version", async () => {
    seed(testDb);

    const response = await PUT(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "pre-refinement" }),
      }),
      makeParams("VPL-100", "sv-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tag).toBe("pre-refinement");
  });

  it("clears the tag when set to null", async () => {
    seed(testDb);

    // First set a tag
    await PUT(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "final" }),
      }),
      makeParams("VPL-100", "sv-1"),
    );

    // Then clear it
    const response = await PUT(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: null }),
      }),
      makeParams("VPL-100", "sv-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tag).toBeNull();
  });

  it("rejects invalid tag values", async () => {
    seed(testDb);

    const response = await PUT(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "invalid-tag" }),
      }),
      makeParams("VPL-100", "sv-1"),
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for non-existent version", async () => {
    seed(testDb);

    const response = await PUT(
      new Request("http://localhost:3100/api/tickets/VPL-100/versions/sv-nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "final" }),
      }),
      makeParams("VPL-100", "sv-nonexistent"),
    );

    expect(response.status).toBe(404);
  });
});
