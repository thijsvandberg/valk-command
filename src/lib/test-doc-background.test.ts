// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
