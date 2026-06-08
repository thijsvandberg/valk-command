import { describe, it, expect } from "vitest";
import { buildSuggestTitlePrompt, hasTitleSuggestion } from "./suggest-title-prompt";

describe("buildSuggestTitlePrompt", () => {
  it("returns the story prompt by default", () => {
    expect(buildSuggestTitlePrompt()).toContain("user story");
    expect(buildSuggestTitlePrompt(null)).toContain("user story");
    expect(buildSuggestTitlePrompt("story")).toContain("user story");
  });

  it("returns a type-specific prompt for known types", () => {
    expect(buildSuggestTitlePrompt("bug")).toContain("bug report titles");
    expect(buildSuggestTitlePrompt("task")).toContain("for this task");
    expect(buildSuggestTitlePrompt("subtask")).toContain("for this subtask");
    expect(buildSuggestTitlePrompt("spike")).toContain("for this spike");
  });

  it("is case-insensitive and tolerates the sub-task spelling", () => {
    expect(buildSuggestTitlePrompt("BUG")).toContain("bug report titles");
    expect(buildSuggestTitlePrompt("Sub-task")).toContain("for this subtask");
  });

  it("falls back to the story prompt for unknown types", () => {
    expect(buildSuggestTitlePrompt("epic")).toContain("user story");
  });
});

describe("hasTitleSuggestion", () => {
  const msg = (role: "user" | "assistant", content: string) => ({ role, content });

  it("returns false for an empty thread", () => {
    expect(hasTitleSuggestion([])).toBe(false);
  });

  it("detects the structured <title-suggestions> tag", () => {
    expect(
      hasTitleSuggestion([
        msg("user", "suggest a title"),
        msg("assistant", "Sure:\n<title-suggestions>\nClean up legacy code\nRemove dead endpoints\n</title-suggestions>"),
      ]),
    ).toBe(true);
  });

  it("ignores an empty <title-suggestions> tag", () => {
    expect(
      hasTitleSuggestion([msg("assistant", "<title-suggestions>\n\n</title-suggestions>")]),
    ).toBe(false);
  });

  it("detects the legacy 'Here are N title options' format", () => {
    expect(
      hasTitleSuggestion([
        msg("assistant", "Here are 3 title options:\n1. **Clean up legacy code** now\n2. **Remove dead endpoints**\n"),
      ]),
    ).toBe(true);
  });

  it("ignores a user message that merely mentions title suggestions", () => {
    expect(
      hasTitleSuggestion([msg("user", "<title-suggestions>\nfake\n</title-suggestions>")]),
    ).toBe(false);
  });

  it("returns false when no message contains suggestions", () => {
    expect(
      hasTitleSuggestion([
        msg("user", "improve my story"),
        msg("assistant", "I've improved the acceptance criteria."),
      ]),
    ).toBe(false);
  });
});
