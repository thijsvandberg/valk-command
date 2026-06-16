// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { listNewStories, countNewStories } from "@/lib/new-stories-query";

interface SeedOpts {
  type?: string;
  status?: string;
  reporter?: string;
  assignee?: string;
  createdAt?: string;
  read?: boolean;
  removed?: boolean;
}

function seed(key: string, opts: SeedOpts = {}) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: opts.status ?? "TO DO",
      type: opts.type ?? "story",
      reporter: opts.reporter ?? "Alice",
      assignee: opts.assignee ?? null,
      jiraCreatedAt: opts.createdAt ?? "2026-06-16T10:00:00Z",
      removedFromJiraAt: opts.removed ? "2026-06-15T00:00:00Z" : null,
    })
    .run();
  if (opts.read) {
    testDb
      .insert(ticketMetadata)
      .values({ jiraKey: key, newStoryReadAt: "2026-06-16T11:00:00Z" })
      .run();
  }
}

describe("listNewStories (BRDG-356)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns only unread tickets", async () => {
    seed("VPL-1");
    seed("VPL-2", { read: true });
    const rows = await listNewStories();
    expect(rows.map((r) => r.key)).toEqual(["VPL-1"]);
  });

  it("excludes sub-tasks but includes epics", async () => {
    seed("VPL-1", { type: "story", createdAt: "2026-06-16T10:00:00Z" });
    seed("VPL-EPIC", { type: "epic", createdAt: "2026-06-16T09:00:00Z" });
    seed("VPL-SUB", { type: "subtask", createdAt: "2026-06-16T08:00:00Z" });
    const rows = await listNewStories();
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("VPL-EPIC");
    expect(keys).not.toContain("VPL-SUB");
  });

  it("excludes drafting/replaced and removed-from-Jira tickets", async () => {
    seed("VPL-1");
    seed("VPL-DRAFT", { status: "DRAFTING" });
    seed("VPL-GONE", { removed: true });
    const rows = await listNewStories();
    expect(rows.map((r) => r.key)).toEqual(["VPL-1"]);
  });

  it("orders by created date descending and builds reporter/assignee", async () => {
    seed("VPL-OLD", { createdAt: "2026-06-10T10:00:00Z" });
    seed("VPL-NEW", { createdAt: "2026-06-16T10:00:00Z", reporter: "Bob", assignee: "Carol" });
    const rows = await listNewStories();
    expect(rows.map((r) => r.key)).toEqual(["VPL-NEW", "VPL-OLD"]);
    expect(rows[0].reporter?.name).toBe("Bob");
    expect(rows[0].assignee?.name).toBe("Carol");
  });
});

describe("countNewStories (BRDG-356)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("counts unread, reviewable tickets only", async () => {
    seed("VPL-1");
    seed("VPL-2");
    seed("VPL-READ", { read: true });
    seed("VPL-SUB", { type: "subtask" });
    expect(await countNewStories()).toBe(2);
  });
});
