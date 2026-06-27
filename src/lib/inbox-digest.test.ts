// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, newStoryRead, userSetting, userTeamAssignment, poUser } from "@/db/schema";
import { randomUUID } from "crypto";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  localDateKey,
  isWeekday,
  dueWindows,
  getInboxBaseline,
  computeInboxDigest,
  WINDOWS,
} from "@/lib/inbox-digest";
import type { NewStoryQueryCtx } from "@/lib/new-stories-query";

const CTX: NewStoryQueryCtx = { userId: "user-a", jiraAccountId: null, jiraName: null };

function seedTicket(
  key: string,
  opts: {
    createdAt: string | null;
    reporter?: string | null;
    sprintName?: string | null;
    reporterAccountId?: string | null;
  },
) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: "TO DO",
      type: "story",
      reporter: opts.reporter ?? null,
      reporterAccountId: opts.reporterAccountId ?? null,
      sprintName: opts.sprintName ?? null,
      jiraCreatedAt: opts.createdAt,
    })
    .run();
}

function markRead(userId: string, key: string, readAt: string) {
  testDb.insert(newStoryRead).values({ userId, ticketKey: key, readAt }).run();
}

function setDefaultTeam(userId: string, team: string | null) {
  testDb
    .insert(userSetting)
    .values({ userId, key: "default_team", value: JSON.stringify(team) })
    .run();
}

function assignTeam(displayName: string, team: string) {
  testDb.insert(userTeamAssignment).values({ id: randomUUID(), displayName, team }).run();
}

function flagPo(displayName: string, accountId?: string) {
  testDb.insert(poUser).values({ id: randomUUID(), displayName, accountId: accountId ?? null }).run();
}

describe("inbox-digest timezone/window helpers (BRDG-413)", () => {
  it("derives the Amsterdam-local calendar date, rolling over at local midnight", () => {
    // 23:30 UTC on Jun 26 is 01:30 on Jun 27 in Amsterdam (CEST, UTC+2).
    expect(localDateKey(new Date("2026-06-26T23:30:00Z"))).toBe("2026-06-27");
    expect(localDateKey(new Date("2026-06-26T07:30:00Z"))).toBe("2026-06-26");
  });

  it("treats Mon-Fri as weekdays and Sat/Sun as weekend (local date)", () => {
    expect(isWeekday(new Date("2026-06-26T07:30:00Z"))).toBe(true); // Friday
    expect(isWeekday(new Date("2026-06-27T10:00:00Z"))).toBe(false); // Saturday
    expect(isWeekday(new Date("2026-06-28T10:00:00Z"))).toBe(false); // Sunday
    expect(isWeekday(new Date("2026-06-29T10:00:00Z"))).toBe(true); // Monday
  });

  it("returns windows whose due time has passed in local time", () => {
    // 08:00 Amsterdam: before both windows.
    expect(dueWindows(new Date("2026-06-26T06:00:00Z"))).toEqual([]);
    // 09:30 Amsterdam: morning only.
    expect(dueWindows(new Date("2026-06-26T07:30:00Z"))).toEqual(["morning"]);
    // 14:00 Amsterdam: both windows due.
    expect(dueWindows(new Date("2026-06-26T12:00:00Z"))).toEqual(["morning", "afternoon"]);
  });

  it("is DST-correct: 09:30 local delivers the morning window in winter too", () => {
    // 08:30 UTC on Jan 9 is 09:30 in Amsterdam (CET, UTC+1).
    expect(dueWindows(new Date("2026-01-09T08:30:00Z"))).toEqual(["morning"]);
    expect(isWeekday(new Date("2026-01-09T08:30:00Z"))).toBe(true); // Friday
  });

  it("exposes the two fixed windows in order", () => {
    expect(WINDOWS.map((w) => w.key)).toEqual(["morning", "afternoon"]);
  });
});

describe("getInboxBaseline (BRDG-413)", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when the user has never marked anything read", async () => {
    expect(await getInboxBaseline("user-a")).toBeNull();
  });

  it("returns the latest readAt across the user's read rows", async () => {
    seedTicket("VPL-1", { createdAt: "2026-06-20T10:00:00Z" });
    seedTicket("VPL-2", { createdAt: "2026-06-21T10:00:00Z" });
    markRead("user-a", "VPL-1", "2026-06-22T08:00:00Z");
    markRead("user-a", "VPL-2", "2026-06-24T15:00:00Z");
    expect(await getInboxBaseline("user-a")).toBe("2026-06-24T15:00:00Z");
  });

  it("is per-user (another user's reads do not leak)", async () => {
    seedTicket("VPL-1", { createdAt: "2026-06-20T10:00:00Z" });
    markRead("user-b", "VPL-1", "2026-06-24T15:00:00Z");
    expect(await getInboxBaseline("user-a")).toBeNull();
  });
});

describe("computeInboxDigest (BRDG-413)", () => {
  const NOW = new Date("2026-06-26T12:00:00Z");

  beforeEach(() => {
    testDb = createTestDb();
  });

  it("counts only rows created after the last read action, bucketed by relevance", async () => {
    setDefaultTeam("user-a", "BT");
    assignTeam("Teammate", "BT");

    // A separate already-read ticket sets the baseline without being a candidate.
    seedTicket("VPL-READ", { createdAt: "2026-06-10T10:00:00Z" });
    markRead("user-a", "VPL-READ", "2026-06-24T10:00:00Z");

    seedTicket("VPL-1", { createdAt: "2026-06-25T09:00:00Z", reporter: "Outsider", sprintName: "BT: 138" });
    seedTicket("VPL-2", { createdAt: "2026-06-25T09:00:00Z", reporter: "Teammate", sprintName: null });
    seedTicket("VPL-OLD", { createdAt: "2026-06-20T09:00:00Z", reporter: "Outsider", sprintName: null });
    seedTicket("VPL-3", { createdAt: "2026-06-26T09:00:00Z", reporter: "Random", sprintName: null });

    const digest = await computeInboxDigest(CTX, NOW);

    expect(digest.baselineAt).toBe("2026-06-24T10:00:00Z");
    expect(digest.total).toBe(3); // VPL-1, VPL-2, VPL-3; VPL-OLD predates baseline
    expect(digest.buckets).toEqual([
      { key: "team_board", label: "On your team's board", count: 1 },
      { key: "teammates", label: "From your teammates", count: 1 },
      { key: "generic_backlog", label: "Generic backlog", count: 1 },
    ]);
  });

  it("counts the whole unread inbox when there is no prior read action (null baseline)", async () => {
    setDefaultTeam("user-a", "BT");
    seedTicket("VPL-1", { createdAt: "2026-06-25T09:00:00Z", reporter: "X", sprintName: null });
    seedTicket("VPL-2", { createdAt: "2026-06-20T09:00:00Z", reporter: "Y", sprintName: null });

    const digest = await computeInboxDigest(CTX, NOW);
    expect(digest.baselineAt).toBeNull();
    expect(digest.total).toBe(2);
  });

  it("counts rows with no createdAt as new (never silently dropped)", async () => {
    setDefaultTeam("user-a", "BT");
    seedTicket("VPL-READ", { createdAt: "2026-06-10T10:00:00Z" });
    markRead("user-a", "VPL-READ", "2026-06-24T10:00:00Z");
    seedTicket("VPL-NULL", { createdAt: null, reporter: "X", sprintName: null });

    const digest = await computeInboxDigest(CTX, NOW);
    expect(digest.total).toBe(1);
  });

  it("returns the total only (no buckets) when no default team is set", async () => {
    // No default_team row.
    seedTicket("VPL-1", { createdAt: "2026-06-25T09:00:00Z", reporter: "X", sprintName: "BT: 1" });
    seedTicket("VPL-2", { createdAt: "2026-06-25T09:00:00Z", reporter: "Y", sprintName: null });

    const digest = await computeInboxDigest(CTX, NOW);
    expect(digest.total).toBe(2);
    expect(digest.buckets).toEqual([]);
  });

  it("ranks another PO's unrelated story into other_pos", async () => {
    setDefaultTeam("user-a", "BT");
    flagPo("Olivia PO", "acc-olivia");
    seedTicket("VPL-READ", { createdAt: "2026-06-10T10:00:00Z" });
    markRead("user-a", "VPL-READ", "2026-06-24T10:00:00Z");
    // On a sprint (not generic backlog), not on my team, authored by a PO.
    seedTicket("VPL-PO", {
      createdAt: "2026-06-25T09:00:00Z",
      reporter: "Olivia PO",
      reporterAccountId: "acc-olivia",
      sprintName: "GXP: 12",
    });

    const digest = await computeInboxDigest(CTX, NOW);
    expect(digest.buckets).toEqual([
      { key: "other_pos", label: "From other POs", count: 1 },
    ]);
  });
});
