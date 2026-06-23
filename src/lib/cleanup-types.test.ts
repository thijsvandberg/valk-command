// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseScanScoresRaw, parseScanScores } from "./cleanup-types";

describe("parseScanScoresRaw", () => {
  it("returns the parsed object for valid JSON", () => {
    const raw = JSON.stringify({ staleness: { score: 0.8 }, replaced: { score: 0.2 } });
    expect(parseScanScoresRaw(raw)).toEqual({
      staleness: { score: 0.8 },
      replaced: { score: 0.2 },
    });
  });

  it("returns an empty object for null/undefined/empty input", () => {
    expect(parseScanScoresRaw(null)).toEqual({});
    expect(parseScanScoresRaw(undefined)).toEqual({});
    expect(parseScanScoresRaw("")).toEqual({});
  });

  it("returns an empty object for corrupt JSON instead of throwing", () => {
    expect(() => parseScanScoresRaw("{not valid")).not.toThrow();
    expect(parseScanScoresRaw("{not valid")).toEqual({});
  });

  it("returns an empty object for non-object JSON payloads", () => {
    expect(parseScanScoresRaw("42")).toEqual({});
    expect(parseScanScoresRaw('"a string"')).toEqual({});
    expect(parseScanScoresRaw("null")).toEqual({});
  });
});

describe("parseScanScores (narrowed map, built on the raw parser)", () => {
  it("keeps numeric per-topic scores and ignores malformed entries", () => {
    const raw = JSON.stringify({ staleness: { score: 0.5 }, replaced: { notScore: 1 } });
    const out = parseScanScores(raw);
    expect(out.staleness).toBe(0.5);
    expect(out.replaced).toBeUndefined();
  });

  it("degrades to an empty map on corrupt JSON", () => {
    expect(parseScanScores("{broken")).toEqual({});
  });
});
