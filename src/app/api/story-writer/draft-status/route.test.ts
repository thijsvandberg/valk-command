// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";

const BASE = "http://localhost:3100/api/story-writer/draft-status";

describe("GET /api/story-writer/draft-status", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns 400 for non-draft keys", async () => {
    const res = await GET(new Request(`${BASE}?key=VPL-100`));
    expect(res.status).toBe(400);
  });

  it("returns 400 when key is missing", async () => {
    const res = await GET(new Request(BASE));
    expect(res.status).toBe(400);
  });

  it("returns 404 when draft does not exist", async () => {
    const res = await GET(new Request(`${BASE}?key=DRAFT-missing`));
    expect(res.status).toBe(404);
  });

  it("returns pending for DRAFTING status", async () => {
    testDb.insert(ticket).values({
      jiraKey: "DRAFT-abc",
      title: "Test",
      status: "DRAFTING",
    }).run();

    const res = await GET(new Request(`${BASE}?key=DRAFT-abc`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("pending");
  });

  it("returns synced with realKey for REPLACED status", async () => {
    testDb.insert(ticket).values({
      jiraKey: "DRAFT-def",
      title: "Test",
      status: "REPLACED",
      description: "VPL-200",
    }).run();

    const res = await GET(new Request(`${BASE}?key=DRAFT-def`));
    const data = await res.json();
    expect(data.status).toBe("synced");
    expect(data.realKey).toBe("VPL-200");
  });

  it("returns error for DRAFT_FAILED status", async () => {
    testDb.insert(ticket).values({
      jiraKey: "DRAFT-ghi",
      title: "Test",
      status: "DRAFT_FAILED",
      description: "Jira timeout",
    }).run();

    const res = await GET(new Request(`${BASE}?key=DRAFT-ghi`));
    const data = await res.json();
    expect(data.status).toBe("error");
    expect(data.error).toBe("Jira timeout");
  });
});
