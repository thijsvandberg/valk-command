import { describe, it, expect } from "vitest";
import { getVisibleChips, type ChipContext } from "./StoryWriterChat";
import type { QuickPrompt } from "@/app/api/settings/quick-prompts/route";

const SAMPLE_API_PROMPTS: QuickPrompt[] = [
  { id: "d-story-0", label: "Improve my story", text: "Improve my story." },
  { id: "d-story-1", label: "Add test scenarios", text: "Add test scenarios" },
  { id: "d-story-2", label: "Technical analysis", text: "Do a technical analysis.", enableCodebase: true },
  { id: "d-story-3", label: "Suggest title", text: "Suggest 3 concise titles." },
];

const DEFAULT_CTX: ChipContext = {
  hasTitle: false,
  hasDraft: false,
  hasRelated: false,
  hasLinkedIssues: false,
};

describe("getVisibleChips", () => {
  it("returns all API prompts when no contextual state is set", () => {
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, DEFAULT_CTX);
    expect(chips.map((c) => c.id)).toEqual([
      "d-story-0",
      "d-story-1",
      "d-story-2",
      "d-story-3",
    ]);
  });

  it("filters out 'Suggest title' when hasTitle is true", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    expect(chips.find((c) => c.label === "Suggest title")).toBeUndefined();
  });

  it("adds 'Find related stories' chip when hasTitle is true", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    expect(chips[0].id).toBe("ctx-find-related");
    expect(chips[0].label).toBe("Find related");
  });

  it("hides 'Find related stories' when related candidates already exist", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasRelated: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    expect(chips.find((c) => c.id === "ctx-find-related")).toBeUndefined();
  });

  it("hides 'Find related stories' when linked issues exist", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasLinkedIssues: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    expect(chips.find((c) => c.id === "ctx-find-related")).toBeUndefined();
  });

  it("adds 'Review story' chip when hasDraft is true", () => {
    const ctx = { ...DEFAULT_CTX, hasDraft: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    const review = chips.find((c) => c.id === "ctx-review-story");
    expect(review).toBeDefined();
    expect(review!.label).toBe("Review story");
  });

  it("keeps 'Find related stories' leading and 'Review story' trailing the API chips", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasDraft: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    expect(chips[0].id).toBe("ctx-find-related");
    expect(chips[chips.length - 1].id).toBe("ctx-review-story");
    const firstApiIdx = chips.findIndex((c) => !c.id.startsWith("ctx-"));
    const reviewIdx = chips.findIndex((c) => c.id === "ctx-review-story");
    expect(firstApiIdx).toBeLessThan(reviewIdx);
  });

  it("applies no cap: every configured prompt renders alongside the contextual chips (BRDG-460)", () => {
    const manyPrompts: QuickPrompt[] = [
      { id: "p0", label: "Improve", text: "..." },
      { id: "p1", label: "Concise", text: "..." },
      { id: "p2", label: "Tests", text: "..." },
      { id: "p3", label: "Technical", text: "..." },
      { id: "p4", label: "Extra", text: "..." },
      { id: "p5", label: "Another", text: "..." },
      { id: "p6", label: "Yet another", text: "..." },
    ];
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasDraft: true };
    const chips = getVisibleChips(manyPrompts, ctx);
    // lead (find-related) + 7 API + trail (review-story)
    expect(chips.length).toBe(9);
    expect(chips.filter((c) => !c.id.startsWith("ctx-")).length).toBe(7);
  });

  it("keeps the trailing 'Review story' chip last regardless of prompt count (BRDG-460)", () => {
    const manyPrompts: QuickPrompt[] = [
      { id: "p0", label: "Improve", text: "..." },
      { id: "p1", label: "Concise", text: "..." },
      { id: "p2", label: "Tests", text: "..." },
      { id: "p3", label: "Technical", text: "..." },
    ];
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasDraft: true };
    const chips = getVisibleChips(manyPrompts, ctx);
    expect(chips.length).toBe(6);
    expect(chips[0].id).toBe("ctx-find-related");
    expect(chips[chips.length - 1].id).toBe("ctx-review-story");
  });

  it("keeps the Investigate chip visible when ranked second (BRDG-435, cap removed in BRDG-460)", () => {
    const prompts: QuickPrompt[] = [
      { id: "d-story-0", label: "Improve story", text: "..." },
      { id: "d-story-5", label: "Investigate", text: "...", enableCodebase: true },
      { id: "d-story-4", label: "Make more concise", text: "..." },
      { id: "d-story-1", label: "Add test scenarios", text: "..." },
      { id: "d-story-2", label: "Technical analysis", text: "...", enableCodebase: true },
      { id: "d-story-3", label: "Suggest title", text: "..." },
    ];
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips(prompts, ctx);
    // lead + 6 prompts - the title suggestion (filtered because hasTitle)
    expect(chips.length).toBe(6);
    expect(chips[0].id).toBe("ctx-find-related");
    expect(chips.find((c) => c.label === "Investigate")).toBeDefined();
  });

  it("handles empty API prompts", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips([], ctx);
    expect(chips.length).toBe(1);
    expect(chips[0].id).toBe("ctx-find-related");
  });

  it("case-insensitive match for 'Suggest title' label", () => {
    const prompts = [{ id: "custom", label: "suggest title", text: "..." }];
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips(prompts, ctx);
    expect(chips.find((c) => c.id === "custom")).toBeUndefined();
  });

  it("does not filter prompts with 'title' in text but different label", () => {
    const prompts = [{ id: "x", label: "Check title length", text: "Check the title" }];
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips(prompts, ctx);
    expect(chips.find((c) => c.id === "x")).toBeDefined();
  });

  it("does not include internal fields (visible, order, actionId) on output chips", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true };
    const chips = getVisibleChips([], ctx);
    const findRelated = chips.find((c) => c.id === "ctx-find-related");
    expect(findRelated).toBeDefined();
    expect("visible" in findRelated!).toBe(false);
    expect("order" in findRelated!).toBe(false);
    expect("placement" in findRelated!).toBe(false);
    expect("actionId" in findRelated!).toBe(false);
  });
});
