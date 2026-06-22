import { describe, it, expect } from "vitest";
import { escapeJql, escapeCql, isValidJiraKey, isKnownIssueType } from "./jql";

describe("escapeJql", () => {
  it("leaves ordinary text untouched", () => {
    expect(escapeJql("login flow")).toBe("login flow");
    expect(escapeJql("VPL-123")).toBe("VPL-123");
  });

  it("escapes double quotes so they cannot close the literal", () => {
    expect(escapeJql('a" OR project = X')).toBe('a\\" OR project = X');
  });

  it("escapes backslashes before quotes (trailing backslash cannot escape the closing quote)", () => {
    expect(escapeJql("a\\")).toBe("a\\\\");
    expect(escapeJql('a\\"')).toBe('a\\\\\\"');
  });

  it("neutralizes a combined break-out payload", () => {
    // `foo\" OR 1=1 --` would otherwise terminate the literal early.
    expect(escapeJql('foo\\" OR 1=1')).toBe('foo\\\\\\" OR 1=1');
  });
});

describe("escapeCql", () => {
  it("mirrors JQL escaping", () => {
    expect(escapeCql('a" AND space="X')).toBe('a\\" AND space=\\"X');
    expect(escapeCql("a\\")).toBe("a\\\\");
  });
});

describe("isValidJiraKey", () => {
  it("accepts well-formed keys (case-insensitive)", () => {
    expect(isValidJiraKey("VPL-123")).toBe(true);
    expect(isValidJiraKey("vpl-1")).toBe(true);
    expect(isValidJiraKey("ABC1-42")).toBe(true);
  });

  it("rejects keys with path/query injection characters", () => {
    expect(isValidJiraKey("VPL-1/transitions")).toBe(false);
    expect(isValidJiraKey("VPL-1?expand=x")).toBe(false);
    expect(isValidJiraKey("VPL-1#frag")).toBe(false);
    expect(isValidJiraKey("../../secret")).toBe(false);
    expect(isValidJiraKey("VPL")).toBe(false);
    expect(isValidJiraKey("")).toBe(false);
    expect(isValidJiraKey(null)).toBe(false);
  });
});

describe("isKnownIssueType", () => {
  it("accepts known types case-insensitively", () => {
    expect(isKnownIssueType("Story")).toBe(true);
    expect(isKnownIssueType("epic")).toBe(true);
    expect(isKnownIssueType("Sub-task")).toBe(true);
  });

  it("rejects unknown or injected types", () => {
    expect(isKnownIssueType('Story" OR 1=1')).toBe(false);
    expect(isKnownIssueType("Nonsense")).toBe(false);
  });
});
