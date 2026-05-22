import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConversationFilters } from "./useConversationFilters";
import type { Conversation } from "@/types/chat";

function makeConv(id: string, title: string, type: "chat" | "investigation" = "chat"): Conversation {
  return { id, title, type, createdAt: "2026-05-22T10:00:00Z", relatedTicket: null, metadata: null };
}

const conversations: Conversation[] = [
  makeConv("1", "Sprint Goal: BT: 137"),
  makeConv("2", "Sprint Goal: BT: 138"),
  makeConv("3", "Story Writer: VPL-45790"),
  makeConv("4", "Stakeholder: BT: 137"),
  makeConv("5", "New conversation"),
  makeConv("6", "New investigation", "investigation"),
  makeConv("7", "Task: suggest-sprint-goal"),
  makeConv("8", "Review: VPL-45001"),
];

describe("useConversationFilters", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom may not support localStorage.clear */ }
    try { localStorage.removeItem("bridge:chat-filters"); } catch { /* ignore */ }
  });

  it("returns all conversations when no filters are active", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));
    expect(result.current.filteredConversations).toHaveLength(conversations.length);
    expect(result.current.activeFilters.size).toBe(0);
  });

  it("computes correct category counts", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));
    expect(result.current.categoryCounts["sprint-goal"]).toBe(2);
    expect(result.current.categoryCounts["story-writer"]).toBe(1);
    expect(result.current.categoryCounts.stakeholder).toBe(1);
    expect(result.current.categoryCounts.chat).toBe(1);
    expect(result.current.categoryCounts.investigation).toBe(1);
    expect(result.current.categoryCounts.task).toBe(1);
    expect(result.current.categoryCounts.review).toBe(1);
  });

  it("filters conversations by toggled category", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));

    act(() => {
      result.current.toggleFilter("sprint-goal");
    });

    expect(result.current.filteredConversations).toHaveLength(2);
    expect(result.current.filteredConversations.every((c) => c.title.startsWith("Sprint Goal:"))).toBe(true);
  });

  it("supports multiple active filters (additive)", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));

    act(() => {
      result.current.toggleFilter("sprint-goal");
    });
    act(() => {
      result.current.toggleFilter("stakeholder");
    });

    expect(result.current.filteredConversations).toHaveLength(3);
    expect(result.current.activeFilters.size).toBe(2);
  });

  it("toggling a filter off removes it", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));

    act(() => {
      result.current.toggleFilter("sprint-goal");
    });
    act(() => {
      result.current.toggleFilter("sprint-goal");
    });

    expect(result.current.filteredConversations).toHaveLength(conversations.length);
    expect(result.current.activeFilters.size).toBe(0);
  });

  it("clearFilters resets to showing all", () => {
    const { result } = renderHook(() => useConversationFilters(conversations));

    act(() => {
      result.current.toggleFilter("chat");
    });
    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filteredConversations).toHaveLength(conversations.length);
    expect(result.current.activeFilters.size).toBe(0);
  });

  it("returns empty array when filter matches nothing", () => {
    const onlyChats = [makeConv("1", "New conversation")];
    const { result } = renderHook(() => useConversationFilters(onlyChats));

    act(() => {
      result.current.toggleFilter("sprint-goal");
    });

    expect(result.current.filteredConversations).toHaveLength(0);
  });
});
