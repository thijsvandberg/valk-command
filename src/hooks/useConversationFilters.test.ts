import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement } from "react";
import { useConversationFilters } from "./useConversationFilters";
import type { Conversation } from "@/types/chat";

// chat-filters are account-scoped (BRDG-343): GET returns { value }, PUT echoes
// the sent value so optimistic toggles settle without reverting.
function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

function mockServer() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    if ((init as RequestInit | undefined)?.method === "PUT") {
      const body = JSON.parse((init as RequestInit).body as string);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ value: [] }), { status: 200 }));
  });
}

function makeConv(id: string, title: string, type: "chat" | "investigation" = "chat"): Conversation {
  return { id, title, type, createdAt: "2026-05-22T10:00:00Z", relatedTicket: null, metadata: null, pinned: false, readAt: null };
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
    mockServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all conversations when no filters are active", () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });
    expect(result.current.filteredConversations).toHaveLength(conversations.length);
    expect(result.current.activeFilters.size).toBe(0);
  });

  it("computes correct category counts", () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });
    expect(result.current.categoryCounts["sprint-goal"]).toBe(2);
    expect(result.current.categoryCounts["story-writer"]).toBe(1);
    expect(result.current.categoryCounts.stakeholder).toBe(1);
    expect(result.current.categoryCounts.chat).toBe(1);
    expect(result.current.categoryCounts.investigation).toBe(1);
    expect(result.current.categoryCounts.task).toBe(1);
    expect(result.current.categoryCounts.review).toBe(1);
  });

  it("filters conversations by toggled category", async () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });

    await act(async () => {
      result.current.toggleFilter("sprint-goal");
    });

    expect(result.current.filteredConversations).toHaveLength(2);
    expect(result.current.filteredConversations.every((c) => c.title.startsWith("Sprint Goal:"))).toBe(true);
  });

  it("supports multiple active filters (additive)", async () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });

    await act(async () => {
      result.current.toggleFilter("sprint-goal");
    });
    await act(async () => {
      result.current.toggleFilter("stakeholder");
    });

    await waitFor(() => expect(result.current.activeFilters.size).toBe(2));
    expect(result.current.filteredConversations).toHaveLength(3);
  });

  it("toggling a filter off removes it", async () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });

    await act(async () => {
      result.current.toggleFilter("sprint-goal");
    });
    await act(async () => {
      result.current.toggleFilter("sprint-goal");
    });

    await waitFor(() => expect(result.current.activeFilters.size).toBe(0));
    expect(result.current.filteredConversations).toHaveLength(conversations.length);
  });

  it("clearFilters resets to showing all", async () => {
    const { result } = renderHook(() => useConversationFilters(conversations), { wrapper });

    await act(async () => {
      result.current.toggleFilter("chat");
    });
    await act(async () => {
      result.current.clearFilters();
    });

    await waitFor(() => expect(result.current.activeFilters.size).toBe(0));
    expect(result.current.filteredConversations).toHaveLength(conversations.length);
  });

  it("returns empty array when filter matches nothing", async () => {
    const onlyChats = [makeConv("1", "New conversation")];
    const { result } = renderHook(() => useConversationFilters(onlyChats), { wrapper });

    await act(async () => {
      result.current.toggleFilter("sprint-goal");
    });

    expect(result.current.filteredConversations).toHaveLength(0);
  });
});
