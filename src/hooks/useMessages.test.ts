import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMessages } from "./useMessages";

const mockMessages = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Hello",
    timestamp: "2026-03-28T10:00:00.000Z",
    workspaceTaskId: null,
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content: "Hi there!",
    timestamp: "2026-03-28T10:00:01.000Z",
    workspaceTaskId: null,
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useMessages", () => {
  it("does not fetch when conversationId is null", () => {
    vi.spyOn(global, "fetch");
    const { result } = renderHook(() => useMessages(null));

    expect(result.current.messages).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches messages from conversation endpoint", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "conv-1",
        title: "Test",
        createdAt: "2026-03-28T10:00:00.000Z",
        relatedTicket: null,
        metadata: null,
        messages: mockMessages,
      }),
    } as Response);

    const { result } = renderHook(() => useMessages("conv-1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages).toEqual(mockMessages);
    expect(result.current.error).toBeNull();
  });

  it("sets error when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error("no json"); },
    } as unknown as Response);

    const { result } = renderHook(() => useMessages("conv-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Request failed (500)");
  });

  it("sends a message with role and replaces optimistic message", async () => {
    const savedMsg = {
      id: "msg-3",
      conversationId: "conv-1",
      role: "user",
      content: "New message",
      timestamp: "2026-03-28T10:01:00.000Z",
      workspaceTaskId: null,
    };

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "conv-1", messages: [] }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "conv-1", messages: [savedMsg] }),
      } as Response);

    const { result } = renderHook(() => useMessages("conv-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => savedMsg,
    } as Response);

    let success;
    await act(async () => {
      success = await result.current.sendMessage("New message");
    });

    expect(success).toBe(true);
    expect(result.current.messages).toEqual([savedMsg]);
  });

  it("rolls back optimistic message on send failure", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "conv-1", messages: [] }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "conv-1", messages: [] }),
      } as Response);

    const { result } = renderHook(() => useMessages("conv-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("no json"); },
    } as unknown as Response);

    let success;
    await act(async () => {
      success = await result.current.sendMessage("Fail message");
    });

    expect(success).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("refetches when conversationId changes", async () => {
    const msgs1 = [mockMessages[0]];
    const msgs2 = [mockMessages[1]];

    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "conv-1", messages: msgs1 }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "conv-2", messages: msgs2 }),
      } as Response);

    const { result, rerender } = renderHook(
      ({ id }) => useMessages(id),
      { initialProps: { id: "conv-1" as string | null } }
    );

    await waitFor(() => expect(result.current.messages).toEqual(msgs1));

    rerender({ id: "conv-2" });

    await waitFor(() => expect(result.current.messages).toEqual(msgs2));
  });
});

describe("useMessages polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls for new messages when hasRunningTask is true", async () => {
    const newMsg = {
      id: "msg-3",
      conversationId: "conv-1",
      role: "assistant",
      content: "New response",
      timestamp: "2026-03-28T10:00:02.000Z",
      workspaceTaskId: "task-1",
    };

    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "conv-1", messages: mockMessages }),
      } as Response);

    const { result } = renderHook(() =>
      useMessages("conv-1", { hasRunningTask: true })
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.messages).toHaveLength(2);

    // Change what the poll returns
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "conv-1", messages: [...mockMessages, newMsg] }),
    } as Response);

    // Advance past poll interval (3s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[2].id).toBe("msg-3");
    // Loading should remain false during polling
    expect(result.current.loading).toBe(false);
  });

  it("stops polling after idle timeout when no running task", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ id: "conv-1", messages: mockMessages }),
      } as Response);

    renderHook(() =>
      useMessages("conv-1", { hasRunningTask: false })
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Count calls during the first 60 seconds (within idle window)
    const callsAfterMount = fetchSpy.mock.calls.length;

    // Advance past idle timeout to 61 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61000);
    });

    const callsAtIdleTimeout = fetchSpy.mock.calls.length;

    // Now advance another 15 seconds (5 more poll intervals)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    // No new fetch calls should have been made after the idle timeout
    expect(fetchSpy.mock.calls.length).toBe(callsAtIdleTimeout);
  });
});
