import { describe, it, expect } from "vitest";
import { resolveJiraKey } from "./parse-key.js";

// A URL instance exposes the same `.search`/`.pathname` shape the content
// script passes via `window.location`, so it doubles as a test fixture.
const loc = (href) => new URL(href);
const BASE = "https://new-story.atlassian.net";

describe("resolveJiraKey", () => {
  it("resolves a /browse/<KEY> path", () => {
    expect(resolveJiraKey(loc(`${BASE}/browse/VPL-47093`))).toBe("VPL-47093");
  });

  it("resolves a ?selectedIssue=<KEY> query param", () => {
    expect(
      resolveJiraKey(loc(`${BASE}/jira/software/projects/VPL/boards/12?selectedIssue=VPL-47093`)),
    ).toBe("VPL-47093");
  });

  it("resolves a board URL with the selectedIssue param plus extra params", () => {
    expect(
      resolveJiraKey(loc(`${BASE}/jira/software/c/projects/VPL/boards/9?selectedIssue=VPL-200&assignee=me`)),
    ).toBe("VPL-200");
  });

  it("prefers selectedIssue over a key in the path", () => {
    expect(resolveJiraKey(loc(`${BASE}/browse/VPL-1?selectedIssue=VPL-999`))).toBe("VPL-999");
  });

  it("resolves non-VPL project keys (generic match)", () => {
    expect(resolveJiraKey(loc(`${BASE}/browse/ABC-12`))).toBe("ABC-12");
  });

  it("returns null for a non-ticket URL", () => {
    expect(resolveJiraKey(loc(`${BASE}/jira/your-work`))).toBeNull();
  });

  it("returns null for a board with no selected issue", () => {
    expect(resolveJiraKey(loc(`${BASE}/jira/software/projects/VPL/boards/12`))).toBeNull();
  });

  it("returns null for a nullish location", () => {
    expect(resolveJiraKey(null)).toBeNull();
    expect(resolveJiraKey(undefined)).toBeNull();
  });
});
