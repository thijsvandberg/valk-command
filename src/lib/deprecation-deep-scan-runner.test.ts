// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createJiraClientMock } from "@/test/mocks";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, deprecationScanQueue, activityLog } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock({
  jiraClient: { isLive: false },
  JiraApiError: class extends Error {},
  extractSprint: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { runDeprecationDeepScan } from "./scheduled-tasks";
import { enqueueDeepScan } from "./deprecation-scan-queue";
import { createNotification } from "./notifications";
import {
  registerTopicScorer,
  _clearTopicScorers,
  setConsolidatedAnalyzer,
  EXAMPLE_RETIRED_AREA_SCORER,
} from "./deprecation-topics";

function insertTicket(key: string, opts: { title?: string } = {}) {
  testDb.insert(ticket).values({
    jiraKey: key,
    title: opts.title ?? key,
    status: "Backlog",
    sprintName: "",
  }).run();
}

describe("runDeprecationDeepScan", () => {
  beforeEach(() => {
    testDb = createTestDb();
    _clearTopicScorers();
    vi.resetAllMocks();
  });

  it("returns an empty result when the queue is empty", async () => {
    const result = await runDeprecationDeepScan();
    expect(result).toMatchObject({ scanned: 0, candidates: 0, errors: 0, skipped: 0 });
  });

  it("dequeues a small batch, scores, marks done, and counts new candidates", async () => {
    insertTicket("BT-1", { title: "Migrate CWI" }); // retired area -> candidate
    insertTicket("BT-2", { title: "Add a button" }); // no signal
    registerTopicScorer(EXAMPLE_RETIRED_AREA_SCORER);
    await enqueueDeepScan(["BT-1", "BT-2"]);

    const result = await runDeprecationDeepScan();
    expect(result.scanned).toBe(2);
    expect(result.candidates).toBe(1);

    const rows = testDb.select().from(deprecationScanQueue).all();
    expect(rows.every((r) => r.status === "done")).toBe(true);

    const meta1 = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-1")).get();
    expect(meta1?.disposition).toBe("candidate");
    expect(meta1?.lastDeepScannedAt).toBeTruthy();
  });

  it("processes at most the batch size per tick (small batches)", async () => {
    for (let i = 0; i < 8; i++) insertTicket(`BT-${i}`);
    await enqueueDeepScan(Array.from({ length: 8 }, (_, i) => `BT-${i}`));

    const result = await runDeprecationDeepScan();
    expect(result.scanned).toBe(5); // DEEP_SCAN_BATCH_SIZE

    const pending = testDb.select().from(deprecationScanQueue).where(eq(deprecationScanQueue.status, "pending")).all();
    expect(pending).toHaveLength(3);
  });

  it("skips (and completes) a dismissed ticket still inside its cooldown", async () => {
    insertTicket("BT-COOL", { title: "Migrate CWI" });
    testDb.insert(ticketMetadata).values({
      jiraKey: "BT-COOL",
      disposition: "dismissed",
      dispositionUntil: new Date(Date.now() + 86400000).toISOString(),
    }).run();
    registerTopicScorer(EXAMPLE_RETIRED_AREA_SCORER);
    await enqueueDeepScan(["BT-COOL"]);

    const result = await runDeprecationDeepScan();
    expect(result.skipped).toBe(1);
    expect(result.candidates).toBe(0);

    const meta = testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, "BT-COOL")).get();
    expect(meta?.disposition).toBe("dismissed"); // untouched
    expect(meta?.lastDeepScannedAt ?? null).toBeNull(); // not scanned
    const row = testDb.select().from(deprecationScanQueue).get();
    expect(row?.status).toBe("done"); // left the queue
  });

  it("resumes across restarts: a row left running is requeued then processed", async () => {
    insertTicket("BT-1");
    await enqueueDeepScan(["BT-1"]);
    // Simulate a crash mid-batch: the row is stuck running with a startedAt old
    // enough to cross the stuck threshold, so it is genuinely recoverable (a
    // freshly-claimed row from an overlapping tick is left alone — BRDG-376).
    testDb.update(deprecationScanQueue)
      .set({ status: "running", startedAt: new Date(Date.now() - 30 * 60_000).toISOString() })
      .run();

    const result = await runDeprecationDeepScan();
    expect(result.recovered).toBe(1);
    expect(result.scanned).toBe(1);
    const row = testDb.select().from(deprecationScanQueue).get();
    expect(row?.status).toBe("done");
  });

  it("notifies the PO when a ticket becomes a new candidate (BRDG-289)", async () => {
    insertTicket("BT-NEW", { title: "Migrate CWI" }); // retired area -> candidate
    insertTicket("BT-PLAIN", { title: "Add a button" }); // no signal -> no notification
    registerTopicScorer(EXAMPLE_RETIRED_AREA_SCORER);
    await enqueueDeepScan(["BT-NEW", "BT-PLAIN"]);

    await runDeprecationDeepScan();

    const calls = vi.mocked(createNotification).mock.calls;
    expect(calls).toHaveLength(1);
    const [type, message, options] = calls[0];
    expect(type).toBe("deprecation-candidate");
    expect(message).toContain("BT-NEW");
    expect(options).toMatchObject({ jiraKey: "BT-NEW", linkUrl: "/cleanup", skipFollowCheck: true });
  });

  it("logs a batch summary to the activity log", async () => {
    insertTicket("BT-1");
    await enqueueDeepScan(["BT-1"]);

    await runDeprecationDeepScan();
    const logs = testDb.select().from(activityLog).all();
    const entry = logs.find((l) => l.type === "deprecation-scan");
    expect(entry?.summary).toContain("Deep scan");
  });

  it("fires a distinct revival notification when a ticket crosses the revival threshold (BRDG-298)", async () => {
    insertTicket("BT-REVIVE", { title: "Still-valuable backlog idea" });
    // Inject a consolidated analyzer that returns a strong revival, no deprecation.
    setConsolidatedAnalyzer(async () => ({
      topicScores: {},
      revival: { score: 0.85, rationale: "Complements active payments work", relatedKeys: ["BT-1"] },
      summary: "Worth pulling up",
    }));
    try {
      await enqueueDeepScan(["BT-REVIVE"]);
      await runDeprecationDeepScan();

      const calls = vi.mocked(createNotification).mock.calls;
      const revival = calls.find((c) => c[0] === "revival-candidate");
      expect(revival).toBeDefined();
      expect(revival![1]).toContain("BT-REVIVE");
      expect(revival![2]).toMatchObject({ jiraKey: "BT-REVIVE", linkUrl: "/cleanup", skipFollowCheck: true });
      // It must NOT also fire a deprecation-candidate for the same ticket.
      expect(calls.some((c) => c[0] === "deprecation-candidate")).toBe(false);
    } finally {
      setConsolidatedAnalyzer(null);
    }
  });
});
