// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

// Hoisted so the vi.mock factory (also hoisted) can safely close over these.
const h = vi.hoisted(() => {
  const state = {
    activeFetches: 0,
    peakFetches: 0,
    sprintIssues: [] as Array<{ key: string }>,
  };
  const getBurnupChangelog = vi.fn(async (key: string) => {
    state.activeFetches++;
    state.peakFetches = Math.max(state.peakFetches, state.activeFetches);
    await new Promise((r) => setTimeout(r, 5));
    state.activeFetches--;
    return {
      statusChanges: [
        {
          fromStatus: "To Do",
          toStatus: "Done",
          changedAt: `2026-01-0${(parseInt(key.split("-")[1], 10) % 9) + 1}T10:00:00.000Z`,
          author: "Tester",
          authorAccountId: "acc-1",
          authorAvatar: null,
        },
      ],
      sprintChanges: [],
    };
  });
  return { state, getBurnupChangelog };
});

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

vi.mock("@/lib/jira-client", () =>
  createJiraClientMock({
    jiraClient: {
      isLive: true,
      getSprints: vi.fn().mockResolvedValue([]),
      getSprintIssues: vi.fn(async () => h.state.sprintIssues),
      searchIssues: vi.fn().mockResolvedValue([]),
      getBurnupChangelog: h.getBurnupChangelog,
    },
  }),
);

import { POST } from "./route";
import { appSetting, ticket, ticketStatusChange } from "@/db/schema";

function makeRequest(sprintId: string): Request {
  return new Request(`http://localhost:3100/api/burnup/seed?sprintId=${sprintId}`, {
    method: "POST",
  });
}

function seedSprint(ticketCount: number) {
  testDb
    .insert(appSetting)
    .values({
      key: "jira_sprints",
      value: JSON.stringify([
        { id: 100, name: "BT: Sprint 10", startDate: "2026-01-01T00:00:00.000Z" },
      ]),
    })
    .run();

  h.state.sprintIssues = [];
  for (let i = 1; i <= ticketCount; i++) {
    const key = `BT-${i}`;
    testDb
      .insert(ticket)
      .values({
        jiraKey: key,
        title: `Ticket ${i}`,
        type: "Story",
        status: "DONE",
        storyPoints: 3,
        sprintName: "100",
      })
      .run();
    h.state.sprintIssues.push({ key });
  }
}

describe("POST /api/burnup/seed", () => {
  beforeEach(() => {
    testDb = createTestDb();
    h.state.activeFetches = 0;
    h.state.peakFetches = 0;
    h.state.sprintIssues = [];
    h.getBurnupChangelog.mockClear();
  });

  it("returns 400 when sprintId is missing", async () => {
    const response = await POST(
      new Request("http://localhost:3100/api/burnup/seed", { method: "POST" }),
    );
    expect(response.status).toBe(400);
  });

  it("fetches each ticket's changelog exactly once and records the status rows", async () => {
    seedSprint(8);

    const response = await POST(makeRequest("100"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.seeded).toBe(true);

    // One fetch per ticket, no duplicates from the concurrency wrapper.
    expect(h.getBurnupChangelog).toHaveBeenCalledTimes(8);
    const fetchedKeys = h.getBurnupChangelog.mock.calls.map((c) => c[0]).sort();
    expect(fetchedKeys).toEqual(["BT-1", "BT-2", "BT-3", "BT-4", "BT-5", "BT-6", "BT-7", "BT-8"]);

    // Each ticket produced exactly one status-change row (the seeded rows are
    // identical to the old per-ticket sequential path).
    const rows = testDb
      .select()
      .from(ticketStatusChange)
      .all()
      .filter((r) => r.sprintName === "100");
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.toStatus === "DONE")).toBe(true);
    expect(rows.every((r) => r.changedBy === "Tester")).toBe(true);
  });

  it("bounds the fan-out concurrency rather than firing all fetches at once", async () => {
    seedSprint(8);
    await POST(makeRequest("100"));
    expect(h.state.peakFetches).toBeGreaterThan(1); // not fully serial
    expect(h.state.peakFetches).toBeLessThanOrEqual(5); // BURNUP_CHANGELOG_CONCURRENCY
  });

  it("is idempotent: a second seed is a no-op", async () => {
    seedSprint(3);
    await POST(makeRequest("100"));
    h.getBurnupChangelog.mockClear();

    const response = await POST(makeRequest("100"));
    const data = await response.json();
    expect(data.message).toBe("Already seeded");
    expect(h.getBurnupChangelog).not.toHaveBeenCalled();
  });
});
