// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { ticket, ticketMetadata, appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  runDeepScan,
  _clearTopicScorers,
  registerTopicScorer,
} from "@/lib/deprecation-topics";
import {
  ALREADY_BUILT_TOPIC,
  ALREADY_BUILT_GATE_THRESHOLD,
  ALREADY_BUILT_DAILY_CAP,
  parseAlreadyBuiltResult,
  _setReadCountFn,
  _resetReadCountFn,
  _setWriteCountFn,
  _resetWriteCountFn,
  _setRunAgentFn,
  _resetRunAgentFn,
} from "./already-built-topic";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-06-04T10:00:00.000Z").getTime();
const TODAY = "2026-06-04";
const TOMORROW = "2026-06-05";

function insertTicket(key: string, opts: { status?: string; description?: string } = {}) {
  testDb
    .insert(ticket)
    .values({
      jiraKey: key,
      title: `Ticket ${key}`,
      status: opts.status ?? "Backlog",
      sprintName: "",
      description: opts.description ?? null,
    })
    .run();
}

/**
 * Write existing scanScores for a ticket (simulates prior Tier-1/Tier-2 runs).
 * Sum of staleness + replaced + duplicate must be above/below the gate.
 */
function writeExistingScores(
  key: string,
  scores: { staleness?: number; replaced?: number; duplicate?: number },
) {
  const map: Record<string, { score: number }> = {};
  if (scores.staleness !== undefined) map.staleness = { score: scores.staleness };
  if (scores.replaced !== undefined) map.replaced = { score: scores.replaced };
  if (scores.duplicate !== undefined) map.duplicate = { score: scores.duplicate };
  testDb
    .insert(ticketMetadata)
    .values({ jiraKey: key, scanScores: JSON.stringify(map) })
    .run();
}

function readFinalScores(key: string) {
  const meta = testDb
    .select()
    .from(ticketMetadata)
    .where(eq(ticketMetadata.jiraKey, key))
    .get();
  return meta?.scanScores ? JSON.parse(meta.scanScores) : {};
}

/** Minimal successful agent response. */
const AGENT_YES_RESPONSE = [
  "IMPLEMENTED: YES",
  "IMPLEMENTED_IN: src/components/MyFeature.tsx",
  "RATIONALE: Feature already ships in MyFeature component.",
].join("\n");

const AGENT_NO_RESPONSE = [
  "IMPLEMENTED: NO",
  "IMPLEMENTED_IN: UNKNOWN",
  "RATIONALE: No matching implementation found.",
].join("\n");

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  testDb = createTestDb();
  _clearTopicScorers();
  registerTopicScorer(ALREADY_BUILT_TOPIC);
});

afterEach(() => {
  _resetReadCountFn();
  _resetWriteCountFn();
  _resetRunAgentFn();
});

// ---------------------------------------------------------------------------
// GATE tests
// ---------------------------------------------------------------------------

describe("ALREADY_BUILT_TOPIC — gate", () => {
  it("abstains without calling the agent when the cheaper-topic sum is below the threshold", async () => {
    insertTicket("BT-1");
    // staleness=0.1, replaced=0.1, duplicate=0.1 -> sum=0.3 < 0.4 (gate)
    writeExistingScores("BT-1", { staleness: 0.1, replaced: 0.1, duplicate: 0.1 });

    const agentMock = vi.fn().mockResolvedValue({ ok: true, output: AGENT_YES_RESPONSE });
    _setRunAgentFn(agentMock);

    const result = await runDeepScan("BT-1", { now: NOW });

    // alreadyBuilt topic must not have run
    expect(result.topicsRun).not.toContain("alreadyBuilt");
    // Agent must NOT have been called
    expect(agentMock).not.toHaveBeenCalled();
  });

  it("abstains without calling the agent when there are no prior scanScores at all", async () => {
    insertTicket("BT-2");
    // No metadata row at all => cheaper sum = 0 < gate

    const agentMock = vi.fn().mockResolvedValue({ ok: true, output: AGENT_YES_RESPONSE });
    _setRunAgentFn(agentMock);

    const result = await runDeepScan("BT-2", { now: NOW });

    expect(result.topicsRun).not.toContain("alreadyBuilt");
    expect(agentMock).not.toHaveBeenCalled();
  });

  it("proceeds past the gate when the cheaper-topic sum meets the threshold", async () => {
    insertTicket("BT-3");
    // staleness=0.5, replaced=0, duplicate=0 -> sum=0.5 >= 0.4 (gate passed)
    writeExistingScores("BT-3", { staleness: 0.5 });

    // Cap check — simulate count=0
    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});

    const agentMock = vi.fn().mockResolvedValue({ ok: true, output: AGENT_NO_RESPONSE });
    _setRunAgentFn(agentMock);

    await runDeepScan("BT-3", { now: NOW });

    // Gate was passed, so agent was called
    expect(agentMock).toHaveBeenCalledOnce();
  });

  it("uses exactly ALREADY_BUILT_GATE_THRESHOLD as the boundary", () => {
    // Ensure the constant itself is 0.4 (so tests are portable if it changes)
    expect(ALREADY_BUILT_GATE_THRESHOLD).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// THROTTLE tests
// ---------------------------------------------------------------------------

describe("ALREADY_BUILT_TOPIC — daily throttle", () => {
  it("stops at the daily cap and does not call the agent once cap is reached", async () => {
    insertTicket("BT-10");
    writeExistingScores("BT-10", { staleness: 0.8 });

    // Simulate that the cap has already been reached for today
    _setReadCountFn(async () => String(ALREADY_BUILT_DAILY_CAP));
    const writeMock = vi.fn().mockResolvedValue(undefined);
    _setWriteCountFn(writeMock);

    const agentMock = vi.fn().mockResolvedValue({ ok: true, output: AGENT_YES_RESPONSE });
    _setRunAgentFn(agentMock);

    const result = await runDeepScan("BT-10", { now: NOW });

    // Must abstain: cap hit
    expect(result.topicsRun).not.toContain("alreadyBuilt");
    expect(agentMock).not.toHaveBeenCalled();
    // Count must NOT be incremented when the cap is already hit
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("increments the counter on a successful agent call", async () => {
    insertTicket("BT-11");
    writeExistingScores("BT-11", { staleness: 0.7 });

    const counts: string[] = [];
    _setReadCountFn(async () => "5");
    const writeMock = vi.fn().mockImplementation(async (_key: string, value: string) => {
      counts.push(value);
    });
    _setWriteCountFn(writeMock);

    _setRunAgentFn(async () => ({ ok: true, output: AGENT_YES_RESPONSE }));

    await runDeepScan("BT-11", { now: NOW });

    expect(writeMock).toHaveBeenCalledOnce();
    // Should have written 6 (5 + 1)
    const [, writtenValue] = writeMock.mock.calls[0] as [string, string];
    expect(writtenValue).toBe("6");
  });

  it("treats a missing setting (first call of the day) as count=0", async () => {
    insertTicket("BT-12");
    writeExistingScores("BT-12", { staleness: 0.6 });

    _setReadCountFn(async () => null); // no row yet
    const writeMock = vi.fn().mockResolvedValue(undefined);
    _setWriteCountFn(writeMock);

    _setRunAgentFn(async () => ({ ok: true, output: AGENT_NO_RESPONSE }));

    await runDeepScan("BT-12", { now: NOW });

    expect(writeMock).toHaveBeenCalledOnce();
    const [, writtenValue] = writeMock.mock.calls[0] as [string, string];
    expect(writtenValue).toBe("1");
  });

  it("uses a different setting key for a different date (throttle resets next day)", async () => {
    insertTicket("BT-13");
    writeExistingScores("BT-13", { staleness: 0.6 });

    const keysRead: string[] = [];
    _setReadCountFn(async (key) => {
      keysRead.push(key);
      return null;
    });
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_NO_RESPONSE }));

    // Run on "tomorrow"
    const tomorrowMs = new Date(`${TOMORROW}T10:00:00.000Z`).getTime();
    await runDeepScan("BT-13", { now: tomorrowMs });

    expect(keysRead.some((k) => k.includes(TOMORROW))).toBe(true);
    expect(keysRead.some((k) => k.includes(TODAY))).toBe(false);
  });

  it("does NOT write alreadyBuilt to scanScores when throttled (ticket remains re-scannable)", async () => {
    insertTicket("BT-14");
    writeExistingScores("BT-14", { staleness: 0.8 });

    _setReadCountFn(async () => String(ALREADY_BUILT_DAILY_CAP)); // cap hit
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_YES_RESPONSE }));

    await runDeepScan("BT-14", { now: NOW });

    const scores = readFinalScores("BT-14");
    // alreadyBuilt must NOT appear in scanScores so the ticket can be retried
    expect(scores.alreadyBuilt).toBeUndefined();
  });

  it("uses ALREADY_BUILT_DAILY_CAP = 20", () => {
    expect(ALREADY_BUILT_DAILY_CAP).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Result parsing tests
// ---------------------------------------------------------------------------

describe("parseAlreadyBuiltResult", () => {
  it("parses a YES response with an implementing file", () => {
    const result = parseAlreadyBuiltResult(AGENT_YES_RESPONSE);
    expect(result.implemented).toBe(true);
    expect(result.implementedIn).toBe("src/components/MyFeature.tsx");
    expect(result.rationale).toBe("Feature already ships in MyFeature component.");
  });

  it("parses a NO response", () => {
    const result = parseAlreadyBuiltResult(AGENT_NO_RESPONSE);
    expect(result.implemented).toBe(false);
    expect(result.implementedIn).toBeNull();
  });

  it("treats unparseable output as NOT implemented (safe default)", () => {
    const result = parseAlreadyBuiltResult("Some random text with no structure");
    expect(result.implemented).toBe(false);
  });

  it("treats UNKNOWN as null implementedIn", () => {
    const output = ["IMPLEMENTED: YES", "IMPLEMENTED_IN: UNKNOWN", "RATIONALE: Found something."].join("\n");
    const result = parseAlreadyBuiltResult(output);
    expect(result.implemented).toBe(true);
    expect(result.implementedIn).toBeNull();
  });

  it("strips leading/trailing markdown fences from rationale", () => {
    // The parser strips leading/trailing quote/fence characters but not inline bold.
    const output = [
      "IMPLEMENTED: YES",
      "IMPLEMENTED_IN: src/foo.ts",
      "RATIONALE: `Feature exists in the codebase.`",
    ].join("\n");
    const result = parseAlreadyBuiltResult(output);
    // Leading/trailing backticks should be stripped
    expect(result.rationale).not.toMatch(/^`/);
    expect(result.rationale).not.toMatch(/`$/);
  });

  it("clamps rationale to 140 chars", () => {
    const longRationale = "x".repeat(200);
    const output = [
      "IMPLEMENTED: YES",
      "IMPLEMENTED_IN: src/foo.ts",
      `RATIONALE: ${longRationale}`,
    ].join("\n");
    const result = parseAlreadyBuiltResult(output);
    expect(result.rationale.length).toBeLessThanOrEqual(140);
  });
});

// ---------------------------------------------------------------------------
// Full scorer tests (score + evidence + rationale)
// ---------------------------------------------------------------------------

describe("ALREADY_BUILT_TOPIC — score and evidence via runDeepScan", () => {
  it("writes alreadyBuilt score + evidence when the agent confirms implementation", async () => {
    insertTicket("BT-20", { description: "Build a dashboard widget for sprint velocity." });
    writeExistingScores("BT-20", { staleness: 0.6, replaced: 0.2 });

    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_YES_RESPONSE }));

    const result = await runDeepScan("BT-20", { now: NOW });

    expect(result.topicsRun).toContain("alreadyBuilt");

    const meta = testDb
      .select()
      .from(ticketMetadata)
      .where(eq(ticketMetadata.jiraKey, "BT-20"))
      .get();
    const scores = JSON.parse(meta!.scanScores!);
    expect(scores.alreadyBuilt.score).toBeGreaterThanOrEqual(0.75);
    expect(scores.alreadyBuilt.evidence.detected).toBe(true);
    expect(scores.alreadyBuilt.evidence.implementedIn).toBe("src/components/MyFeature.tsx");
    expect(scores.alreadyBuilt.evidence.degraded).toBe(false);
    expect(scores.alreadyBuilt.rationale).toBe("Appears already implemented");
    expect(meta!.scanRationale).toContain("Appears already implemented");
  });

  it("scores 0.9 when a concrete file reference is found", async () => {
    insertTicket("BT-21");
    writeExistingScores("BT-21", { staleness: 0.5 });

    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_YES_RESPONSE }));

    await runDeepScan("BT-21", { now: NOW });

    const scores = readFinalScores("BT-21");
    expect(scores.alreadyBuilt.score).toBe(0.9);
  });

  it("scores 0.75 when YES but no concrete file reference (UNKNOWN)", async () => {
    insertTicket("BT-22");
    writeExistingScores("BT-22", { staleness: 0.5 });

    const noRefResponse = [
      "IMPLEMENTED: YES",
      "IMPLEMENTED_IN: UNKNOWN",
      "RATIONALE: Appears implemented but location not found.",
    ].join("\n");

    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: noRefResponse }));

    await runDeepScan("BT-22", { now: NOW });

    const scores = readFinalScores("BT-22");
    expect(scores.alreadyBuilt.score).toBe(0.75);
  });

  it("abstains (no alreadyBuilt written) when the agent says NO", async () => {
    insertTicket("BT-23");
    writeExistingScores("BT-23", { staleness: 0.6 });

    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({ ok: true, output: AGENT_NO_RESPONSE }));

    const result = await runDeepScan("BT-23", { now: NOW });

    // topic ran (gate+throttle passed) but abstained because NO
    expect(result.topicsRun).not.toContain("alreadyBuilt");
    const scores = readFinalScores("BT-23");
    expect(scores.alreadyBuilt).toBeUndefined();
  });

  it("degrades gracefully (abstains, never throws) when the agent fails", async () => {
    insertTicket("BT-24");
    writeExistingScores("BT-24", { staleness: 0.7 });

    _setReadCountFn(async () => "0");
    _setWriteCountFn(async () => {});
    _setRunAgentFn(async () => ({
      ok: false,
      reason: "timeout",
      error: "Timed out waiting for the workspace task",
    }));

    const result = await runDeepScan("BT-24", { now: NOW });

    // Must not throw, must not write alreadyBuilt
    expect(result.scanned).toBe(true);
    expect(result.topicsRun).not.toContain("alreadyBuilt");
    const scores = readFinalScores("BT-24");
    expect(scores.alreadyBuilt).toBeUndefined();
  });

  it("does not alter scanScores written by other topics when it abstains", async () => {
    insertTicket("BT-25");
    // Pre-existing replaced score from BRDG-285
    writeExistingScores("BT-25", { staleness: 0.1, replaced: 0.1, duplicate: 0.1 });

    const agentMock = vi.fn();
    _setRunAgentFn(agentMock);

    await runDeepScan("BT-25", { now: NOW });

    // Below gate — other scores should survive unchanged
    const scores = readFinalScores("BT-25");
    expect(scores.staleness).toBeDefined();
    expect(scores.alreadyBuilt).toBeUndefined();
    expect(agentMock).not.toHaveBeenCalled();
  });
});
