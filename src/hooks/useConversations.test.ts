import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { SWRConfig } from "swr";
import { useConversations } from "./useConversations";

const mockConversation = {
  id: "conv-1",
  title: "Test conversation",
  createdAt: "2026-03-28T10:00:00.000Z",
  relatedTicket: null,
  metadata: null,
  pinned: false,
};

// Each test gets its own SWR cache so a populated key from a prior test cannot
// leak into the next one.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useConversations", () => {
  it("loads conversations on mount", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [mockConversation],
    } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations).toEqual([mockConversation]);
    expect(result.current.error).toBeNull();
  });

  it("sets error when load fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error("no json"); },
    } as unknown as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Request failed (500)");
    expect(result.current.conversations).toEqual([]);
  });

  it("dedupes the request when two consumers mount together", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [mockConversation],
    } as Response);

    // Two consumers of the same key in one tree must dedupe to a single fetch.
    const { result } = renderHook(
      () => {
        useConversations();
        return useConversations();
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.conversations).toEqual([mockConversation]));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("creates a conversation and prepends it to the list", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockConversation,
    } as Response);

    let created;
    await act(async () => {
      created = await result.current.createConversation("Test conversation");
    });

    expect(created).toEqual(mockConversation);
    expect(result.current.conversations).toEqual([mockConversation]);
  });

  it("deletes a conversation optimistically", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockConversation],
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [mockConversation],
      } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response);

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteConversation("conv-1");
    });

    expect(deleted).toBe(true);
    expect(result.current.conversations).toEqual([]);
  });

  it("sets error on failed delete", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockConversation],
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [mockConversation],
      } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("no json"); },
    } as unknown as Response);

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteConversation("conv-1");
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe("Request failed (500)");
  });
});

describe("useConversations polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates conversations when polled data differs", async () => {
    const updatedConversation = { ...mockConversation, title: "Updated title" };

    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [mockConversation],
      } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.conversations[0].title).toBe("Test conversation");

    // Change what the next poll returns
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => [updatedConversation],
    } as Response);

    // Advance past poll interval (5s) and flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.conversations[0].title).toBe("Updated title");
    // Loading should not have been set during poll
    expect(result.current.loading).toBe(false);
  });

  it("does not re-render when polled data is unchanged", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [mockConversation],
    } as Response);

    const { result } = renderHook(() => useConversations(), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    const firstRef = result.current.conversations;

    // Advance past poll, same data
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Same reference means no re-render triggered
    expect(result.current.conversations).toBe(firstRef);
  });
});
