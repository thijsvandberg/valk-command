import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
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
    expect(fetch).toHaveBeenCalledWith("/api/conversations/conv-1", expect.objectContaining({}));
  });

  it("sets error when fetch fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => savedMsg,
      } as Response);

    const { result } = renderHook(() => useMessages("conv-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success;
    await act(async () => {
      success = await result.current.sendMessage("New message");
    });

    expect(success).toBe(true);
    expect(result.current.messages).toEqual([savedMsg]);
    expect(fetch).toHaveBeenCalledWith("/api/conversations/conv-1/messages", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content: "New message" }),
    }));
  });

  it("rolls back optimistic message on send failure", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "conv-1", messages: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("no json"); },
      } as unknown as Response);

    const { result } = renderHook(() => useMessages("conv-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

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
      .mockResolvedValueOnce({
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
    expect(fetch).toHaveBeenCalledWith("/api/conversations/conv-2", expect.objectContaining({}));
  });
});
