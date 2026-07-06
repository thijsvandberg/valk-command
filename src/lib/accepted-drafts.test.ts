import { describe, it, expect } from "vitest";
import { computeAcceptedDraftIds, type AcceptableDraft } from "./accepted-drafts";

function draft(overrides: Partial<AcceptableDraft> = {}): AcceptableDraft {
  return { id: "d-1", content: "## Description\nHello", storySlot: "original", ...overrides };
}

describe("computeAcceptedDraftIds (BRDG-483)", () => {
  it("marks an original-slot draft accepted when it matches localDraft", () => {
    const drafts = [draft({ id: "d-1", content: "Accepted body" })];
    const result = computeAcceptedDraftIds(drafts, "Accepted body", null);
    expect(result.has("d-1")).toBe(true);
  });

  it("does not mark a draft accepted when localDraft differs", () => {
    const drafts = [draft({ id: "d-1", content: "Original body" })];
    const result = computeAcceptedDraftIds(drafts, "A later, edited body", null);
    expect(result.has("d-1")).toBe(false);
  });

  it("matches a target-slot draft against targetLocalDraft, not localDraft", () => {
    const drafts = [
      draft({ id: "orig", content: "Original body", storySlot: "original" }),
      draft({ id: "tgt", content: "Target body", storySlot: "target" }),
    ];
    const result = computeAcceptedDraftIds(drafts, "Original body", "Target body");
    expect(result.has("orig")).toBe(true);
    expect(result.has("tgt")).toBe(true);
  });

  it("does not cross-match a target draft to localDraft", () => {
    const drafts = [draft({ id: "tgt", content: "Shared body", storySlot: "target" })];
    // Content lives in localDraft, but this is a target-slot draft, so no match.
    const result = computeAcceptedDraftIds(drafts, "Shared body", null);
    expect(result.has("tgt")).toBe(false);
  });

  it("ignores whitespace differences (trailing newline)", () => {
    const drafts = [draft({ id: "d-1", content: "Body text\n" })];
    const result = computeAcceptedDraftIds(drafts, "Body text", null);
    expect(result.has("d-1")).toBe(true);
  });

  it("never accepts an empty-content draft even against an empty slot", () => {
    const drafts = [draft({ id: "d-1", content: "   " })];
    const result = computeAcceptedDraftIds(drafts, "", null);
    expect(result.has("d-1")).toBe(false);
  });

  it("leaves a superseded draft unaccepted while the newer one is accepted", () => {
    const drafts = [
      draft({ id: "old", content: "First cut" }),
      draft({ id: "new", content: "Refined final" }),
    ];
    // localDraft holds the newer, accepted content only.
    const result = computeAcceptedDraftIds(drafts, "Refined final", null);
    expect(result.has("new")).toBe(true);
    expect(result.has("old")).toBe(false);
  });

  it("returns an empty set when nothing is saved", () => {
    const drafts = [draft({ id: "d-1", content: "Body" })];
    expect(computeAcceptedDraftIds(drafts, null, null).size).toBe(0);
  });
});
