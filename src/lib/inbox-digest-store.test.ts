// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Control the digest total/buckets so this suite isolates the window + cap logic;
// the real tz helpers (dueWindows/isWeekday/localDateKey) are kept.
const computeMock = vi.fn();
vi.mock("@/lib/inbox-digest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/inbox-digest")>();
  return { ...actual, computeInboxDigest: (...args: unknown[]) => computeMock(...args) };
});

import { evaluateInboxDigest, clearActiveDigest, type InboxDigestState } from "@/lib/inbox-digest-store";
import { readUserSetting, writeUserSetting } from "@/lib/user-settings";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

const CTX: NewStoryQueryCtx = { userId: "user-a", jiraAccountId: null, jiraName: null };

// Amsterdam local times on Friday 2026-06-26 (CEST, UTC+2).
const BEFORE_MORNING = new Date("2026-06-26T06:00:00Z"); // 08:00
const MORNING_0930 = new Date("2026-06-26T07:30:00Z"); // 09:30
const AFTERNOON_1400 = new Date("2026-06-26T12:00:00Z"); // 14:00
const LATE_1600 = new Date("2026-06-26T14:00:00Z"); // 16:00
const SATURDAY = new Date("2026-06-27T12:00:00Z"); // weekend

function digest(total: number) {
  return {
    total,
    baselineAt: "2026-06-24T10:00:00Z",
    buckets:
      total > 0
        ? [{ key: "team_board" as const, label: "On your team's board", count: total }]
        : [],
  };
}

async function storedState(userId: string): Promise<InboxDigestState | null> {
  const raw = await readUserSetting("inbox_digest", userId);
  return raw ? (JSON.parse(raw) as InboxDigestState) : null;
}

describe("evaluateInboxDigest (BRDG-413)", () => {
  beforeEach(() => {
    testDb = createTestDb();
    computeMock.mockReset();
  });

  it("generates nothing on weekends (and does not compute)", async () => {
    computeMock.mockResolvedValue(digest(5));
    const active = await evaluateInboxDigest(CTX, SATURDAY);
    expect(active).toBeNull();
    expect(computeMock).not.toHaveBeenCalled();
  });

  it("generates nothing before the first window is due", async () => {
    computeMock.mockResolvedValue(digest(5));
    const active = await evaluateInboxDigest(CTX, BEFORE_MORNING);
    expect(active).toBeNull();
    expect(computeMock).not.toHaveBeenCalled();
  });

  it("delivers the morning digest when the user is active at 09:30", async () => {
    computeMock.mockResolvedValue(digest(3));
    const active = await evaluateInboxDigest(CTX, MORNING_0930);
    expect(active).not.toBeNull();
    expect(active!.id).toBe("2026-06-26:morning");
    expect(active!.total).toBe(3);
    expect((await storedState("user-a"))!.deliveredWindows).toEqual(["morning"]);
  });

  it("caps at two deliveries per weekday", async () => {
    computeMock.mockResolvedValue(digest(2));
    await evaluateInboxDigest(CTX, MORNING_0930); // morning
    await evaluateInboxDigest(CTX, AFTERNOON_1400); // afternoon
    const third = await evaluateInboxDigest(CTX, LATE_1600); // no slot left

    expect(computeMock).toHaveBeenCalledTimes(2);
    expect((await storedState("user-a"))!.deliveredWindows).toEqual(["morning", "afternoon"]);
    // Third call returns the still-active afternoon digest unchanged.
    expect(third!.id).toBe("2026-06-26:afternoon");
  });

  it("arriving at 14:00 shows one banner and consumes both windows", async () => {
    computeMock.mockResolvedValue(digest(7));
    const active = await evaluateInboxDigest(CTX, AFTERNOON_1400);

    expect(computeMock).toHaveBeenCalledTimes(1);
    expect(active!.id).toBe("2026-06-26:afternoon");
    expect((await storedState("user-a"))!.deliveredWindows).toEqual(["morning", "afternoon"]);
  });

  it("does not spend a window when there is nothing new", async () => {
    computeMock.mockResolvedValueOnce(digest(0));
    const first = await evaluateInboxDigest(CTX, MORNING_0930);
    expect(first).toBeNull();
    // Empty window not spent: no state persisted, slot still open.
    expect(await storedState("user-a")).toBeNull();

    computeMock.mockResolvedValueOnce(digest(4));
    const second = await evaluateInboxDigest(CTX, MORNING_0930);
    expect(second!.id).toBe("2026-06-26:morning");
    expect((await storedState("user-a"))!.deliveredWindows).toEqual(["morning"]);
  });

  it("resets the per-day bookkeeping on day rollover", async () => {
    await writeUserSetting(
      "inbox_digest",
      "user-a",
      JSON.stringify({
        active: { id: "2026-06-25:afternoon", generatedAt: "x", baselineAt: null, total: 9, buckets: [] },
        deliveryDate: "2026-06-25",
        deliveredWindows: ["morning", "afternoon"],
      } satisfies InboxDigestState),
    );

    computeMock.mockResolvedValue(digest(1));
    const active = await evaluateInboxDigest(CTX, MORNING_0930);

    expect(active!.id).toBe("2026-06-26:morning");
    const state = (await storedState("user-a"))!;
    expect(state.deliveryDate).toBe("2026-06-26");
    expect(state.deliveredWindows).toEqual(["morning"]);
  });

  it("never delivers a digest for the anonymous global fallback (BRDG-453)", async () => {
    computeMock.mockResolvedValue(digest(322));
    const active = await evaluateInboxDigest(
      { userId: "global", jiraAccountId: null, jiraName: null },
      MORNING_0930,
    );
    // The global identity has no read history (null baseline), so a digest would
    // announce the entire unread inbox as new. Suppress it entirely: null result,
    // nothing computed, no state written.
    expect(active).toBeNull();
    expect(computeMock).not.toHaveBeenCalled();
    expect(await storedState("global")).toBeNull();
  });

  it("is per-user (a delivery to one user does not consume another's slot)", async () => {
    computeMock.mockResolvedValue(digest(2));
    await evaluateInboxDigest(CTX, MORNING_0930);
    const other = await evaluateInboxDigest(
      { userId: "user-b", jiraAccountId: null, jiraName: null },
      MORNING_0930,
    );
    expect(other!.id).toBe("2026-06-26:morning");
    expect((await storedState("user-b"))!.deliveredWindows).toEqual(["morning"]);
  });
});

describe("clearActiveDigest (BRDG-413)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("clears active but preserves deliveredWindows (slot stays spent)", async () => {
    await writeUserSetting(
      "inbox_digest",
      "user-a",
      JSON.stringify({
        active: { id: "2026-06-26:morning", generatedAt: "x", baselineAt: null, total: 3, buckets: [] },
        deliveryDate: "2026-06-26",
        deliveredWindows: ["morning"],
      } satisfies InboxDigestState),
    );

    await clearActiveDigest("user-a");

    const state = (await storedState("user-a"))!;
    expect(state.active).toBeNull();
    expect(state.deliveredWindows).toEqual(["morning"]);
  });

  it("is a no-op when there is no stored state", async () => {
    await expect(clearActiveDigest("user-a")).resolves.toBeUndefined();
    expect(await storedState("user-a")).toBeNull();
  });
});
