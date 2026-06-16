// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, newStoryRead } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { listNewStories, countNewStories } from "@/lib/new-stories-query";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

// Default acting user: a Clerk id with no recorded Jira identity, so nothing is
// self-excluded unless a test opts in.
function ctx(overrides: Partial<NewStoryQueryCtx> = {}): NewStoryQueryCtx {
  return { userId: "user-a", jiraAccountId: null, jiraName: null, ...overrides };
}

interface SeedOpts {
  type?: string;
  status?: string;
  reporter?: string;
  reporterAccountId?: string | null;
  assignee?: string;
  createdAt?: string;
  readBy?: string;
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
      reporterAccountId: opts.reporterAccountId ?? null,
      assignee: opts.assignee ?? null,
      jiraCreatedAt: opts.createdAt ?? "2026-06-16T10:00:00Z",
      removedFromJiraAt: opts.removed ? "2026-06-15T00:00:00Z" : null,
    })
    .run();
  if (opts.readBy) {
    testDb
      .insert(newStoryRead)
      .values({ userId: opts.readBy, ticketKey: key, readAt: "2026-06-16T11:00:00Z" })
      .run();
  }
}

describe("listNewStories (BRDG-356/359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns only tickets unread by the acting user", async () => {
    seed("VPL-1");
    seed("VPL-2", { readBy: "user-a" });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-1"]);
  });

  it("scopes read state per user: A's read leaves the row unread for B", async () => {
    seed("VPL-1", { readBy: "user-a" });
    expect((await listNewStories(ctx({ userId: "user-a" }))).map((r) => r.key)).toEqual([]);
    expect((await listNewStories(ctx({ userId: "user-b" }))).map((r) => r.key)).toEqual(["VPL-1"]);
  });

  it("excludes sub-tasks but includes epics", async () => {
    seed("VPL-1", { type: "story", createdAt: "2026-06-16T10:00:00Z" });
    seed("VPL-EPIC", { type: "epic", createdAt: "2026-06-16T09:00:00Z" });
    seed("VPL-SUB", { type: "subtask", createdAt: "2026-06-16T08:00:00Z" });
    const rows = await listNewStories(ctx());
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("VPL-EPIC");
    expect(keys).not.toContain("VPL-SUB");
  });

  it("excludes drafting/replaced and removed-from-Jira tickets", async () => {
    seed("VPL-1");
    seed("VPL-DRAFT", { status: "DRAFTING" });
    seed("VPL-GONE", { removed: true });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-1"]);
  });

  it("excludes stories the acting user authored (by reporter accountId)", async () => {
    seed("VPL-MINE", { reporterAccountId: "acc-me" });
    seed("VPL-THEIRS", { reporterAccountId: "acc-other" });
    const rows = await listNewStories(ctx({ jiraAccountId: "acc-me" }));
    expect(rows.map((r) => r.key)).toEqual(["VPL-THEIRS"]);
  });

  it("keeps tickets with no reporter accountId when self-excluding by id", async () => {
    seed("VPL-NOACC", { reporterAccountId: null });
    seed("VPL-MINE", { reporterAccountId: "acc-me" });
    const rows = await listNewStories(ctx({ jiraAccountId: "acc-me" }));
    expect(rows.map((r) => r.key)).toEqual(["VPL-NOACC"]);
  });

  it("falls back to reporter name when no accountId is known", async () => {
    seed("VPL-MINE", { reporter: "Me", reporterAccountId: null });
    seed("VPL-THEIRS", { reporter: "Alice", reporterAccountId: null });
    const rows = await listNewStories(ctx({ jiraName: "Me" }));
    expect(rows.map((r) => r.key)).toEqual(["VPL-THEIRS"]);
  });

  it("excludes nothing when neither accountId nor name is known", async () => {
    seed("VPL-1", { reporter: "Alice" });
    seed("VPL-2", { reporter: "Bob" });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key).sort()).toEqual(["VPL-1", "VPL-2"]);
  });

  it("orders by created date descending and builds reporter/assignee", async () => {
    seed("VPL-OLD", { createdAt: "2026-06-10T10:00:00Z" });
    seed("VPL-NEW", { createdAt: "2026-06-16T10:00:00Z", reporter: "Bob", assignee: "Carol" });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-NEW", "VPL-OLD"]);
    expect(rows[0].reporter?.name).toBe("Bob");
    expect(rows[0].assignee?.name).toBe("Carol");
  });

  it("exposes the ticket's Jira status on the row", async () => {
    seed("VPL-1", { status: "IN PROGRESS" });
    const rows = await listNewStories(ctx());
    expect(rows[0].jiraStatus).toBe("IN PROGRESS");
  });
});

describe("countNewStories (BRDG-356/359)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("counts unread, reviewable tickets only for the acting user", async () => {
    seed("VPL-1");
    seed("VPL-2");
    seed("VPL-READ", { readBy: "user-a" });
    seed("VPL-SUB", { type: "subtask" });
    expect(await countNewStories(ctx())).toBe(2);
  });

  it("excludes the acting user's authored stories from the count", async () => {
    seed("VPL-1");
    seed("VPL-MINE", { reporterAccountId: "acc-me" });
    expect(await countNewStories(ctx({ jiraAccountId: "acc-me" }))).toBe(1);
  });

  it("counts per-user: a row read by A is still counted for B", async () => {
    seed("VPL-1", { readBy: "user-a" });
    expect(await countNewStories(ctx({ userId: "user-a" }))).toBe(0);
    expect(await countNewStories(ctx({ userId: "user-b" }))).toBe(1);
  });
});
