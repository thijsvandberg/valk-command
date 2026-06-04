import { describe, it, expect } from "vitest";
import { parseDeprecationAnalysis } from "./parse-deprecation-analysis";

function block(json: unknown): string {
  return `Some prose summary.\n\n<deprecation-analysis>\n${JSON.stringify(json)}\n</deprecation-analysis>`;
}

const WELL_FORMED = {
  key: "VPL-100",
  topics: {
    staleness: { score: 0.4, rationale: "Untouched for a year", evidence: "updated 2025-01" },
    replaced: { score: 0.9, rationale: "About CWI", evidence: "CWI" },
    duplicate: { score: 0.7, rationale: "Newer twin", supersededBy: "VPL-200", evidence: "" },
    alreadyBuilt: { score: 0.85, rationale: "Shipped", evidence: "src/foo.ts" },
    relevance: { score: 0.3, rationale: "Still fits" },
  },
  revival: {
    revivalScore: 0.0,
    rationale: "",
    relatedKeys: [],
  },
  summary: "Leans deprecation: retired area + duplicate.",
};

describe("parseDeprecationAnalysis", () => {
  it("parses a well-formed block including evidence and supersededBy", () => {
    const out = parseDeprecationAnalysis(block(WELL_FORMED));
    expect(out).not.toBeNull();
    expect(out!.key).toBe("VPL-100");
    expect(out!.topics.replaced).toMatchObject({ score: 0.9, rationale: "About CWI", evidence: "CWI" });
    expect(out!.topics.duplicate).toMatchObject({ score: 0.7, supersededBy: "VPL-200" });
    // Empty-string evidence is dropped (not stored as "").
    expect(out!.topics.duplicate!.evidence).toBeUndefined();
    expect(out!.topics.alreadyBuilt!.evidence).toBe("src/foo.ts");
    expect(out!.summary).toContain("deprecation");
  });

  it("parses a revival-leaning block with related keys", () => {
    const out = parseDeprecationAnalysis(
      block({
        key: "VPL-300",
        topics: { relevance: { score: 0.1, rationale: "Still on-roadmap" } },
        revival: {
          revivalScore: 0.82,
          rationale: "Complements the active payments work",
          relatedKeys: ["VPL-400", "VPL-401"],
        },
        summary: "Worth pulling up.",
      }),
    );
    expect(out!.revival.score).toBeCloseTo(0.82);
    expect(out!.revival.relatedKeys).toEqual(["VPL-400", "VPL-401"]);
    expect(out!.revival.rationale).toContain("payments");
  });

  it("defaults missing fields safely and clamps out-of-range scores", () => {
    const out = parseDeprecationAnalysis(
      block({
        // no key, no summary
        topics: { replaced: { score: 5 }, relevance: { score: -2, rationale: "" } },
        revival: { revivalScore: 1.7 },
      }),
    );
    expect(out!.key).toBeNull();
    expect(out!.summary).toBe("");
    expect(out!.topics.replaced!.score).toBe(1); // clamped from 5
    expect(out!.topics.replaced!.rationale).toBe(""); // missing -> empty
    expect(out!.topics.relevance!.score).toBe(0); // clamped from -2
    expect(out!.revival.score).toBe(1); // clamped from 1.7
    expect(out!.revival.relatedKeys).toEqual([]); // missing -> empty array
  });

  it("accepts a bare `score` for revival as an alias", () => {
    const out = parseDeprecationAnalysis(
      block({ topics: {}, revival: { score: 0.55, rationale: "x" } }),
    );
    expect(out!.revival.score).toBeCloseTo(0.55);
  });

  it("returns null when no block is present", () => {
    expect(parseDeprecationAnalysis("just prose, no block")).toBeNull();
  });

  it("returns null on malformed JSON inside the block (never throws)", () => {
    const bad = "<deprecation-analysis>{ not: valid json, }</deprecation-analysis>";
    expect(parseDeprecationAnalysis(bad)).toBeNull();
  });

  it("returns null when the block body is not an object", () => {
    expect(parseDeprecationAnalysis("<deprecation-analysis>[1,2,3]</deprecation-analysis>")).toBeNull();
  });

  it("tolerates non-object topics and revival without throwing", () => {
    const out = parseDeprecationAnalysis(
      block({ key: "VPL-1", topics: "nope", revival: 42, summary: "ok" }),
    );
    expect(out).not.toBeNull();
    expect(out!.topics).toEqual({});
    expect(out!.revival).toEqual({ score: 0, rationale: "", relatedKeys: [] });
  });

  it("returns null for a non-string input", () => {
    // @ts-expect-error exercising the defensive guard
    expect(parseDeprecationAnalysis(null)).toBeNull();
  });
});
