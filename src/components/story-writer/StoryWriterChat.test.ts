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
    expect(chips[0].label).toBe("Find related stories");
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

  it("puts contextual chips before API chips", () => {
    const ctx = { ...DEFAULT_CTX, hasTitle: true, hasDraft: true };
    const chips = getVisibleChips(SAMPLE_API_PROMPTS, ctx);
    const ctxIds = chips.filter((c) => c.id.startsWith("ctx-")).map((c) => c.id);
    const apiIds = chips.filter((c) => !c.id.startsWith("ctx-")).map((c) => c.id);
    // All contextual chips should come before all API chips
    const lastCtxIdx = chips.findIndex((c) => c.id === ctxIds[ctxIds.length - 1]);
    const firstApiIdx = chips.findIndex((c) => c.id === apiIds[0]);
    expect(lastCtxIdx).toBeLessThan(firstApiIdx);
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
    expect("actionId" in findRelated!).toBe(false);
  });
});
