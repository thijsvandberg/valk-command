import { describe, it, expect } from "vitest";
import { matchDeprecatedAreas, type DeprecatedArea } from "./deprecated-area-matcher";

const AREAS: DeprecatedArea[] = [
  { term: "CWI" },
  { term: "RezExchange", aliases: "Rez Exchange" },
  { term: "IDPMS" },
  { term: "hybrid cloud", aliases: "hybrid-cloud" },
];

describe("matchDeprecatedAreas", () => {
  it("matches a term in the title and scores high", () => {
    const result = matchDeprecatedAreas({ title: "Migrate the CWI dashboard" }, AREAS);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].term).toBe("CWI");
    expect(result.matches[0].fields).toContain("title");
    expect(result.baseScore).toBeGreaterThanOrEqual(0.7);
  });

  it("matches via an alias", () => {
    const result = matchDeprecatedAreas(
      { title: "Update Rez Exchange sync flow" },
      AREAS,
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].term).toBe("RezExchange");
    expect(result.matches[0].matchedTerms).toContain("rez exchange");
  });

  it("matches a multi-word term around its internal space", () => {
    const result = matchDeprecatedAreas(
      { title: "Decommission hybrid cloud infra" },
      AREAS,
    );
    expect(result.matches.map((m) => m.term)).toContain("hybrid cloud");
  });

  it("does not match a short term as a substring of another word", () => {
    // "cwi" inside "scwint" must NOT match (word-boundary guard).
    const result = matchDeprecatedAreas({ title: "Fix scwint rendering bug" }, AREAS);
    expect(result.matches).toHaveLength(0);
    expect(result.baseScore).toBe(0);
  });

  it("scores a body-only (incidental) mention lower than a title mention", () => {
    const titleHit = matchDeprecatedAreas({ title: "CWI rework" }, AREAS);
    const bodyHit = matchDeprecatedAreas(
      { title: "Unrelated work", description: "Touches the CWI module in passing." },
      AREAS,
    );
    expect(bodyHit.matches).toHaveLength(1);
    expect(bodyHit.matches[0].fields).toEqual(["description"]);
    expect(bodyHit.baseScore).toBeLessThan(titleHit.baseScore);
  });

  it("matches across labels and components too", () => {
    const result = matchDeprecatedAreas(
      { title: "Generic title", labels: "idpms,legacy", components: "RezExchange" },
      AREAS,
    );
    const terms = result.matches.map((m) => m.term).sort();
    expect(terms).toEqual(["IDPMS", "RezExchange"]);
  });

  it("nudges the score up when more than one area matches but stays capped", () => {
    const result = matchDeprecatedAreas(
      { title: "CWI and IDPMS cleanup" },
      AREAS,
    );
    expect(result.matches).toHaveLength(2);
    expect(result.baseScore).toBeLessThanOrEqual(0.85);
    expect(result.baseScore).toBeGreaterThan(0.7);
  });

  it("returns no matches (abstain) when nothing is mentioned", () => {
    const result = matchDeprecatedAreas(
      { title: "Improve the sprint board filters" },
      AREAS,
    );
    expect(result.matches).toEqual([]);
    expect(result.baseScore).toBe(0);
  });

  it("is case-insensitive", () => {
    const result = matchDeprecatedAreas({ title: "rezexchange teardown" }, AREAS);
    expect(result.matches[0].term).toBe("RezExchange");
  });

  it("ignores areas with empty terms and skips empty alias entries", () => {
    const result = matchDeprecatedAreas(
      { title: "CWI" },
      [{ term: "", aliases: "" }, { term: "CWI", aliases: ", ," }],
    );
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].term).toBe("CWI");
  });
});
