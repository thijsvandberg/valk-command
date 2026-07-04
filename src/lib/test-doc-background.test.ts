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

import { persistTestDocDraftWhenDone } from "./test-doc-background";
import { logger } from "@/lib/logger";
import { ticket, ticketMetadata } from "@/db/schema";
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
