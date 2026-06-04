// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mapAnalysisToResult,
  runConsolidatedAnalysis,
  _setRunAgentFn,
  _resetRunAgentFn,
} from "./deprecation-analyzer";
import type { ParsedDeprecationAnalysis } from "./parse-deprecation-analysis";
import type { DeprecationTicketContext } from "./deprecation-topics";

function parsed(overrides: Partial<ParsedDeprecationAnalysis> = {}): ParsedDeprecationAnalysis {
  return {
    key: "VPL-1",
    topics: {},
    revival: { score: 0, rationale: "", relatedKeys: [] },
    summary: "",
    ...overrides,
  };
}

const TICKET: DeprecationTicketContext = {
  jiraKey: "VPL-1",
  title: "Migrate CWI dashboards",
  status: "Backlog",
  description: "Old CWI work",
  jiraUpdatedAt: null,
  sprintName: "",
  labels: null,
  components: null,
};

describe("mapAnalysisToResult", () => {
  it("maps topics above the abstain threshold into scanScores entries", () => {
    const out = mapAnalysisToResult(
      parsed({
        topics: {
          replaced: { score: 0.9, rationale: "About CWI", evidence: "CWI" },
          relevance: { score: 0.05, rationale: "fine" }, // below abstain -> dropped
        },
      }),
    );
    expect(out.topicScores.replaced).toMatchObject({ score: 0.9, rationale: "About CWI" });
    expect((out.topicScores.replaced!.evidence as { note?: string }).note).toBe("CWI");
    expect(out.topicScores.relevance).toBeUndefined();
  });

  it("carries supersededBy as structured duplicate evidence", () => {
    const out = mapAnalysisToResult(
      parsed({ topics: { duplicate: { score: 0.8, rationale: "twin", supersededBy: "VPL-9" } } }),
    );
    expect((out.topicScores.duplicate!.evidence as { supersededBy?: string }).supersededBy).toBe("VPL-9");
  });

  it("passes the revival verdict through unchanged", () => {
    const out = mapAnalysisToResult(
      parsed({ revival: { score: 0.75, rationale: "fits payments", relatedKeys: ["VPL-5"] } }),
    );
    expect(out.revival).toEqual({ score: 0.75, rationale: "fits payments", relatedKeys: ["VPL-5"] });
  });
});

describe("runConsolidatedAnalysis", () => {
  beforeEach(() => {
    vi.stubEnv("VALK_AGENT_KEY", "test-key");
  });
  afterEach(() => {
    _resetRunAgentFn();
    vi.unstubAllEnvs();
  });

  it("runs the analyze-deprecation skill and maps the parsed result", async () => {
    const output = `<deprecation-analysis>${JSON.stringify({
      key: "VPL-1",
      topics: { replaced: { score: 0.9, rationale: "CWI", evidence: "CWI" } },
      revival: { revivalScore: 0.7, rationale: "fits work", relatedKeys: ["VPL-2"] },
      summary: "ok",
    })}</deprecation-analysis>`;
    const run = vi.fn().mockResolvedValue({ ok: true, output });
    _setRunAgentFn(run);

    const out = await runConsolidatedAnalysis(TICKET, { now: 123 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toMatchObject({ skill: "analyze-deprecation" });
    expect(out!.topicScores.replaced!.score).toBeCloseTo(0.9);
    expect(out!.revival.score).toBeCloseTo(0.7);
  });

  it("returns null when the agent fails (caller falls back)", async () => {
    _setRunAgentFn(vi.fn().mockResolvedValue({ ok: false, reason: "submit-failed", error: "x" }));
    expect(await runConsolidatedAnalysis(TICKET)).toBeNull();
  });

  it("returns null when the output has no parseable block", async () => {
    _setRunAgentFn(vi.fn().mockResolvedValue({ ok: true, output: "no block here" }));
    expect(await runConsolidatedAnalysis(TICKET)).toBeNull();
  });

  it("skips the agent entirely when VALK_AGENT_KEY is unset (default runner)", async () => {
    _resetRunAgentFn();
    vi.stubEnv("VALK_AGENT_KEY", "");
    const out = await runConsolidatedAnalysis(TICKET);
    expect(out).toBeNull();
  });
});
