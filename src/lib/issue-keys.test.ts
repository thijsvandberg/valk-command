import { describe, it, expect } from "vitest";
import { extractIssueKeys } from "./issue-keys";

describe("extractIssueKeys", () => {
  it("extracts a single bare key", () => {
    expect(extractIssueKeys("See VPL-47038 for details")).toEqual(["VPL-47038"]);
  });

  it("extracts multiple bare keys in first-seen order", () => {
    expect(extractIssueKeys("Blocks VPL-100 and relates to VPL-42")).toEqual([
      "VPL-100",
      "VPL-42",
    ]);
  });

  it("extracts a key embedded in a Jira browse URL", () => {
    expect(
      extractIssueKeys("https://new-story.atlassian.net/browse/VPL-47038"),
    ).toEqual(["VPL-47038"]);
  });

  it("treats a bare key and the same key inside a URL as one key", () => {
    const text =
      "VPL-47038 is tracked at https://new-story.atlassian.net/browse/VPL-47038";
    expect(extractIssueKeys(text)).toEqual(["VPL-47038"]);
  });

  it("uppercases lowercase and mixed-case keys", () => {
    expect(extractIssueKeys("see vpl-1 and Vpl-2")).toEqual(["VPL-1", "VPL-2"]);
  });

  it("de-dupes case-insensitively, keeping first-seen order", () => {
    expect(extractIssueKeys("VPL-1 then vpl-1 then VPL-1")).toEqual(["VPL-1"]);
  });

  it("preserves first-seen order across description-like then comment-like text", () => {
    const blob = ["Body mentions VPL-3", "Comment mentions VPL-1 and VPL-3"].join("\n");
    expect(extractIssueKeys(blob)).toEqual(["VPL-3", "VPL-1"]);
  });

  it("matches keys from other projects, not only VPL", () => {
    expect(extractIssueKeys("VPL-1 and ABC-99")).toEqual(["VPL-1", "ABC-99"]);
  });

  it("returns an empty array when there is no key", () => {
    expect(extractIssueKeys("no issue keys here, just prose")).toEqual([]);
  });

  it("does not treat a bare date as a key", () => {
    expect(extractIssueKeys("released on 2026-06-29")).toEqual([]);
  });

  it("returns an empty array for empty, null, or undefined input", () => {
    expect(extractIssueKeys("")).toEqual([]);
    expect(extractIssueKeys(null)).toEqual([]);
    expect(extractIssueKeys(undefined)).toEqual([]);
  });
});
