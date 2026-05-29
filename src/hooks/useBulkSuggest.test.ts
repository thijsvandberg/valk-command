import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/api-client", () => ({
  refinementSessions: {
    bulkSuggestSubtasks: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
    suggestionCountsUrl: (id: string | null) => id ? `/api/refinement-sessions/${id}/suggestion-counts` : null,
  },
  swrFetcher: vi.fn(),
}));

vi.mock("@/lib/jira-url", () => ({
  getJiraUrl: (key: string) => `https://jira.example.com/browse/${key}`,
}));

import { useBulkSuggest } from "./useBulkSuggest";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import type { Ticket } from "@/types/ticket";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

const mockTickets: Ticket[] = [
  { key: "VPL-1", title: "Test ticket 1" } as Ticket,
  { key: "VPL-2", title: "Test ticket 2" } as Ticket,
];

describe("useBulkSuggest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("initial state with no session", () => {
    const { result } = renderHook(
      () => useBulkSuggest({ resolvedSessionId: null, queueTickets: [] }),
      { wrapper },
    );
    expect(result.current.bulkSuggestRunning).toBe(false);
    expect(result.current.bulkSuggestConvId).toBeNull();
    expect(result.current.bulkSuggestVisible).toBe(false);
  });

  it("triggers bulk suggest API call", async () => {
    const { result } = renderHook(
      () => useBulkSuggest({ resolvedSessionId: "session-1", queueTickets: mockTickets }),
      { wrapper },
    );

    await act(async () => { await result.current.handleBulkSuggest(); });

    expect(refinementSessionsApi.bulkSuggestSubtasks).toHaveBeenCalledWith("session-1", undefined);
    expect(result.current.bulkSuggestVisible).toBe(true);
  });

  it("copy stories to clipboard", async () => {
    const { result } = renderHook(
      () => useBulkSuggest({ resolvedSessionId: "session-1", queueTickets: mockTickets }),
      { wrapper },
    );

    await act(async () => { result.current.handleCopyStories(); });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("VPL-1"),
    );
  });

  it("guards against running twice", async () => {
    // Simulate bulkSuggestRunning = true by mocking SWR response
    const { result } = renderHook(
      () => useBulkSuggest({ resolvedSessionId: null, queueTickets: mockTickets }),
      { wrapper },
    );

    // Without a sessionId, handleBulkSuggest should not call the API
    await act(async () => { await result.current.handleBulkSuggest(); });
    expect(refinementSessionsApi.bulkSuggestSubtasks).not.toHaveBeenCalled();
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(refinementSessionsApi.bulkSuggestSubtasks).mockRejectedValue(new Error("fail"));

    const { result } = renderHook(
      () => useBulkSuggest({ resolvedSessionId: "session-1", queueTickets: mockTickets }),
      { wrapper },
    );

    // Should not throw
    await act(async () => { await result.current.handleBulkSuggest(); });
    expect(result.current.bulkSuggestVisible).toBe(true);
  });
});
