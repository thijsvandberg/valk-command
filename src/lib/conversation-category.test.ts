// @vitest-environment node
import { describe, it, expect } from "vitest";
import { deriveCategory, CATEGORY_CONFIG, ALL_CATEGORIES } from "./conversation-category";
import type { Conversation } from "@/types/chat";

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "test-id",
    title: "New conversation",
    type: "chat",
    createdAt: "2026-05-22T10:00:00Z",
    relatedTicket: null,
    metadata: null,
    pinned: false,
    readAt: null,
    ...overrides,
  };
}

describe("deriveCategory", () => {
  it("returns 'investigation' when type is investigation", () => {
    expect(deriveCategory(makeConv({ type: "investigation", title: "New investigation" }))).toBe("investigation");
  });

  it("returns 'investigation' for Investigate: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Investigate: how does auth work" }))).toBe("investigation");
  });

  it("returns 'sprint-goal' for Sprint Goal: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Sprint Goal: BT: 137" }))).toBe("sprint-goal");
  });

  it("returns 'story-writer' for Story Writer: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Story Writer: VPL-45790" }))).toBe("story-writer");
  });

  it("returns 'stakeholder' for Stakeholder: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Stakeholder: BT: 137" }))).toBe("stakeholder");
  });

  it("returns 'review' for Review: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Review: VPL-45001" }))).toBe("review");
  });

  it("returns 'task' for Task: prefix", () => {
    expect(deriveCategory(makeConv({ title: "Task: suggest-sprint-goal" }))).toBe("task");
  });

  it("returns 'chat' for generic conversations", () => {
    expect(deriveCategory(makeConv({ title: "New conversation" }))).toBe("chat");
  });

  it("returns 'chat' for unrecognized titles", () => {
    expect(deriveCategory(makeConv({ title: "Some Random Title" }))).toBe("chat");
  });

  it("does not match partial prefixes", () => {
    expect(deriveCategory(makeConv({ title: "Sprint Goals are great" }))).toBe("chat");
  });

  it("prioritizes type=investigation over title prefix", () => {
    expect(deriveCategory(makeConv({ type: "investigation", title: "Story Writer: something" }))).toBe("investigation");
  });
});

describe("CATEGORY_CONFIG", () => {
  it("has a config entry for every category", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_CONFIG[cat]).toBeDefined();
      expect(CATEGORY_CONFIG[cat].label).toBeTruthy();
      expect(CATEGORY_CONFIG[cat].icon).toBeTruthy();
      expect(CATEGORY_CONFIG[cat].color).toBeTruthy();
    }
  });
});
