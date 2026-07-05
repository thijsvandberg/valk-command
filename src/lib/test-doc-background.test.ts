// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockAgentFetch = vi.fn();
vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { persistTestDocDraftWhenDone, maybeAutoGenerateTestDoc } from "./test-doc-background";
import { logger } from "@/lib/logger";
import { ticket, ticketMetadata, ticketSprint, sprintSlot } from "@/db/schema";
import { eq } from "drizzle-orm";

const noSleep = () => Promise.resolve();

function docPayload(markdown: string, classification = "ok") {
  return `<test-doc>${JSON.stringify({ classification, markdown })}</test-doc>`;
}

function getMetadata(key: string) {
  return testDb.select().from(ticketMetadata).where(eq(ticketMetadata.jiraKey, key)).get();
}

describe("persistTestDocDraftWhenDone", () => {
  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(ticket).values({ jiraKey: "VPL-10", title: "S", type: "story", status: "TEST" }).run();
    mockAgentFetch.mockReset();
  });

  it("polls until completion and persists the parsed draft", async () => {
    mockAgentFetch
      .mockResolvedValueOnce({ ok: true, data: { status: "running" } })
      .mockResolvedValueOnce({
        ok: true,
        data: { status: "completed", output: docPayload("**Doc**\n\n- A", "not_stakeholder_relevant") },
      });

    await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep });

    const meta = getMetadata("VPL-10");
    expect(meta?.testDocDraft).toBe("**Doc**\n\n- A");
    expect(meta?.testDocDraftClassification).toBe("not_stakeholder_relevant");
  });

  it("caches unstructured output as an ok draft", async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, data: { status: "completed", output: "raw text" } });

    await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep });

    expect(getMetadata("VPL-10")?.testDocDraft).toBe("raw text");
  });

  it("writes nothing on failed/cancelled tasks and survives poll errors", async () => {
    mockAgentFetch
      .mockResolvedValueOnce({ ok: false, error: { error: "boom" }, status: 502 })
      .mockResolvedValueOnce({ ok: true, data: { status: "failed" } });

    await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep });

    expect(getMetadata("VPL-10")).toBeUndefined();
  });

  it("gives up after maxAttempts without throwing", async () => {
    mockAgentFetch.mockResolvedValue({ ok: true, data: { status: "running" } });

    await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep, maxAttempts: 3 });

    expect(mockAgentFetch).toHaveBeenCalledTimes(3);
    expect(getMetadata("VPL-10")).toBeUndefined();
  });

  describe("env tunables + error logging (BRDG-470)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("respects TEST_DOC_POLL_MAX_ATTEMPTS from the environment", async () => {
      vi.stubEnv("TEST_DOC_POLL_MAX_ATTEMPTS", "2");
      mockAgentFetch.mockResolvedValue({ ok: true, data: { status: "running" } });

      await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep });

      expect(mockAgentFetch).toHaveBeenCalledTimes(2);
    });

    it("lets explicit opts win over the environment", async () => {
      vi.stubEnv("TEST_DOC_POLL_MAX_ATTEMPTS", "5");
      mockAgentFetch.mockResolvedValue({ ok: true, data: { status: "running" } });

      await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep, maxAttempts: 3 });

      expect(mockAgentFetch).toHaveBeenCalledTimes(3);
    });

    it("falls back to the default on invalid env values", async () => {
      vi.stubEnv("TEST_DOC_POLL_INTERVAL_MS", "banana");
      vi.stubEnv("TEST_DOC_POLL_MAX_ATTEMPTS", "0");
      const sleeps: number[] = [];
      const recordingSleep = (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      };
      mockAgentFetch.mockResolvedValueOnce({ ok: true, data: { status: "completed", output: "raw" } });

      await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: recordingSleep });

      expect(sleeps[0]).toBe(3000);
      expect(mockAgentFetch).toHaveBeenCalledTimes(1);
    });

    it("logs an error with key and task id on timeout", async () => {
      mockAgentFetch.mockResolvedValue({ ok: true, data: { status: "running" } });

      await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep, maxAttempts: 2 });

      expect(logger.error).toHaveBeenCalledWith(
        "generate-test-doc",
        expect.stringMatching(/VPL-10.*task-1/),
      );
    });

    it("logs an error with key and task id on a failed task, but not on cancelled", async () => {
      mockAgentFetch.mockResolvedValueOnce({ ok: true, data: { status: "failed" } });
      await persistTestDocDraftWhenDone("VPL-10", "task-1", { sleepFn: noSleep });
      expect(logger.error).toHaveBeenCalledWith(
        "generate-test-doc",
        expect.stringMatching(/VPL-10.*task-1/),
      );

      vi.mocked(logger.error).mockClear();
      mockAgentFetch.mockResolvedValueOnce({ ok: true, data: { status: "cancelled" } });
      await persistTestDocDraftWhenDone("VPL-10", "task-2", { sleepFn: noSleep });
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});

describe("maybeAutoGenerateTestDoc (BRDG-471)", () => {
  // Pin VPL-10 (seeded status TEST) via a sprint that also occupies a slot.
  function pin(key: string, sprintId = "6001") {
    testDb.insert(ticketSprint).values({ ticketKey: key, sprintId }).run();
    testDb.insert(sprintSlot).values({ slotIndex: 0, sprintId, sprintName: "Sprint" }).run();
  }

  beforeEach(() => {
    testDb = createTestDb();
    testDb.insert(ticket).values({ jiraKey: "VPL-10", title: "S", type: "story", status: "TEST" }).run();
    mockAgentFetch.mockReset();
    // Kickoff fails so no background poll is scheduled; we only assert the gate.
    mockAgentFetch.mockResolvedValue({ ok: false, error: { error: "nope", code: "server_error" }, status: 500 });
  });

  it("fires generation for a pinned-sprint ticket in the null state", async () => {
    pin("VPL-10");

    await maybeAutoGenerateTestDoc("VPL-10");

    expect(mockAgentFetch).toHaveBeenCalledTimes(1);
    expect(mockAgentFetch.mock.calls[0][0]).toBe("/api/tasks");
    const body = (mockAgentFetch.mock.calls[0][1] as { body: { skill: string } }).body;
    expect(body.skill).toBe("generate-test-doc");
  });

  it("no-ops for a DRAFT-xxx key (never hits Jira/agent)", async () => {
    await maybeAutoGenerateTestDoc("DRAFT-abc");
    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("no-ops when the ticket is in no pinned sprint", async () => {
    // In a sprint, but that sprint occupies no slot.
    testDb.insert(ticketSprint).values({ ticketKey: "VPL-10", sprintId: "6001" }).run();

    await maybeAutoGenerateTestDoc("VPL-10");

    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("no-ops when a draft already exists", async () => {
    pin("VPL-10");
    testDb.insert(ticketMetadata).values({ jiraKey: "VPL-10", testDocDraft: "**old**" }).run();

    await maybeAutoGenerateTestDoc("VPL-10");

    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("no-ops when an accepted doc already exists", async () => {
    pin("VPL-10");
    testDb.insert(ticketMetadata).values({ jiraKey: "VPL-10", testDoc: "**accepted**" }).run();

    await maybeAutoGenerateTestDoc("VPL-10");

    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("no-ops when the ticket is marked not-needed", async () => {
    pin("VPL-10");
    testDb.insert(ticketMetadata).values({ jiraKey: "VPL-10", testDocClassification: "not_stakeholder_relevant" }).run();

    await maybeAutoGenerateTestDoc("VPL-10");

    expect(mockAgentFetch).not.toHaveBeenCalled();
  });

  it("does not double-fire while a generation is already in flight", async () => {
    pin("VPL-10");
    vi.useFakeTimers();
    try {
      // START returns a task id, so a background capture is scheduled and parked on
      // the poll interval (fake timer). The in-flight guard stays set until it ends.
      mockAgentFetch.mockReset();
      mockAgentFetch
        .mockResolvedValueOnce({ ok: true, data: { id: "task-1" } })
        .mockResolvedValue({ ok: true, data: { status: "completed", output: docPayload("Doc") } });

      await maybeAutoGenerateTestDoc("VPL-10"); // fires; capture parked on the interval
      await maybeAutoGenerateTestDoc("VPL-10"); // in-flight guard blocks a second kickoff
      expect(mockAgentFetch).toHaveBeenCalledTimes(1);

      // Let the parked capture finish so the guard is released for later tests.
      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }
    expect(getMetadata("VPL-10")?.testDocDraft).toBe("Doc");
  });
});
