// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, newStoryRead } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { listNewStories, countNewStories, INBOX_AGE_WINDOW_MS } from "@/lib/new-stories-query";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

// Dates are seeded relative to the real clock so the 6-week age filter
// (BRDG-442) is deterministic regardless of when the suite runs; fixed calendar
// dates would silently age out of the window and become time-bombs.
const DAY = 24 * 60 * 60 * 1000;
function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

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
  createdAt?: string | null;
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
      jiraCreatedAt: opts.createdAt === undefined ? daysAgo(7) : opts.createdAt,
      removedFromJiraAt: opts.removed ? daysAgo(8) : null,
    })
    .run();
  if (opts.readBy) {
    testDb
      .insert(newStoryRead)
      .values({ userId: opts.readBy, ticketKey: key, readAt: daysAgo(6) })
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
    seed("VPL-1", { type: "story", createdAt: daysAgo(3) });
    seed("VPL-EPIC", { type: "epic", createdAt: daysAgo(4) });
    seed("VPL-SUB", { type: "subtask", createdAt: daysAgo(5) });
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
    seed("VPL-OLD", { createdAt: daysAgo(20) });
    seed("VPL-NEW", { createdAt: daysAgo(5), reporter: "Bob", assignee: "Carol" });
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

// The 6-week age cutoff and the read-flag cleanup it makes safe (BRDG-442).
describe("inbox age filter (BRDG-442)", () => {
  const windowDays = INBOX_AGE_WINDOW_MS / DAY;

  beforeEach(() => {
    testDb = createTestDb();
  });

  it("hides a story created more than 6 weeks ago and keeps a recent one", async () => {
    seed("VPL-OLD", { createdAt: daysAgo(windowDays + 3) });
    seed("VPL-RECENT", { createdAt: daysAgo(3) });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-RECENT"]);
  });

  it("keeps a story right inside the window and hides one just outside it", async () => {
    // Day-granularity boundary: a couple of days clear of the edge on each side
    // avoids the few-hours offset-vs-Z slop documented on the filter.
    seed("VPL-INSIDE", { createdAt: daysAgo(windowDays - 2) });
    seed("VPL-OUTSIDE", { createdAt: daysAgo(windowDays + 2) });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-INSIDE"]);
  });

  it("handles real Jira offset-form timestamps, not just ...Z", async () => {
    // Production stores Jira's offset form (e.g. ...+0200), never ...Z. A clearly
    // recent offset-form date must pass and a clearly old one must be dropped.
    const recent = new Date(Date.now() - 3 * DAY).toISOString().replace("Z", "+0200");
    seed("VPL-RECENT-OFFSET", { createdAt: recent });
    seed("VPL-ANCIENT-OFFSET", { createdAt: "2019-10-15T10:18:37.793+0200" });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-RECENT-OFFSET"]);
  });

  it("excludes a story with a null jiraCreatedAt (treated as outside the window)", async () => {
    seed("VPL-DATED", { createdAt: daysAgo(3) });
    seed("VPL-NULL", { createdAt: null });
    const rows = await listNewStories(ctx());
    expect(rows.map((r) => r.key)).toEqual(["VPL-DATED"]);
  });

  it("badge count matches the filtered list (aged-out story not counted)", async () => {
    seed("VPL-OLD", { createdAt: daysAgo(windowDays + 3) });
    seed("VPL-RECENT", { createdAt: daysAgo(3) });
    seed("VPL-NULL", { createdAt: null });
    expect(await countNewStories(ctx())).toBe(1);
  });

  // Safety invariant proof: deleting an aged-out read-flag (what
  // cleanupReadStoryFlags does) must not resurrect the ticket in the inbox,
  // because the age filter already suppresses it independently of the flag.
  it("aged-out story stays hidden after its read-flag is deleted", async () => {
    seed("VPL-AGED", { createdAt: daysAgo(windowDays + 5), readBy: "user-a" });
    // Sanity: hidden while read (both the read-flag and the age filter exclude it).
    expect((await listNewStories(ctx())).map((r) => r.key)).toEqual([]);

    // Simulate the cleanup task removing the aged read-flag.
    testDb.delete(newStoryRead).where(eq(newStoryRead.ticketKey, "VPL-AGED")).run();

    // Still absent: the age filter, not the read-flag, now keeps it out.
    expect((await listNewStories(ctx())).map((r) => r.key)).toEqual([]);
    expect(await countNewStories(ctx())).toBe(0);
  });
});
