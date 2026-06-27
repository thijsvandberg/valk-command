// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "x-bridge-user-id" ? currentUser : null),
  }),
}));

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: async () => null,
}));

// Resolve the query ctx from the current test user (skips the Clerk/Jira lookup).
vi.mock("@/lib/new-stories-ctx", () => ({
  resolveNewStoryQueryCtx: async () => ({
    userId: currentUser ?? "global",
    jiraAccountId: null,
    jiraName: null,
  }),
}));

// Control the computed digest so the route's evaluate path is deterministic.
const computeMock = vi.fn();
vi.mock("@/lib/inbox-digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inbox-digest")>();
  return { ...actual, computeInboxDigest: (...args: unknown[]) => computeMock(...args) };
});

import { GET, DELETE } from "./route";

function digest(total: number) {
  return {
    total,
    baselineAt: "2026-06-24T10:00:00Z",
    buckets:
      total > 0 ? [{ key: "team_board", label: "On your team's board", count: total }] : [],
  };
}

describe("/api/inbox/digest (BRDG-413)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    currentUser = null;
    computeMock.mockReset();
    // Friday 2026-06-26 14:00 Amsterdam (both windows due).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("GET evaluates and returns the active digest, not cached", async () => {
    currentUser = "user-a";
    computeMock.mockResolvedValue(digest(5));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");

    const data = await res.json();
    expect(data.active.total).toBe(5);
    expect(data.active.id).toBe("2026-06-26:afternoon");
  });

  it("GET returns null when there is nothing new", async () => {
    currentUser = "user-a";
    computeMock.mockResolvedValue(digest(0));

    const data = await (await GET()).json();
    expect(data.active).toBeNull();
  });

  it("is per-user: one user's delivery does not surface for another", async () => {
    computeMock.mockResolvedValue(digest(2));

    currentUser = "user-a";
    expect((await (await GET()).json()).active.id).toBe("2026-06-26:afternoon");

    currentUser = "user-b";
    // user-b has their own fresh state, so they also get a delivery.
    expect((await (await GET()).json()).active.id).toBe("2026-06-26:afternoon");
  });

  it("DELETE clears active but preserves the spent slot", async () => {
    currentUser = "user-a";
    computeMock.mockResolvedValue(digest(4));

    // Deliver (consumes both windows today).
    expect((await (await GET()).json()).active.total).toBe(4);

    const del = await DELETE();
    expect(del.status).toBe(200);
    expect((await del.json()).ok).toBe(true);

    // Re-evaluating the same day: slot already spent, so no fresh banner.
    const after = await (await GET()).json();
    expect(after.active).toBeNull();
  });
});
