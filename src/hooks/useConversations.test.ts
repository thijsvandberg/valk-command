import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useConversations } from "./useConversations";

const mockConversation = {
  id: "conv-1",
  title: "Test conversation",
  createdAt: "2026-03-28T10:00:00.000Z",
  relatedTicket: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useConversations", () => {
  it("loads conversations on mount", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [mockConversation],
    } as Response);

    const { result } = renderHook(() => useConversations());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations).toEqual([mockConversation]);
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/conversations");
  });

  it("sets error when load fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load conversations");
    expect(result.current.conversations).toEqual([]);
  });

  it("creates a conversation and prepends it to the list", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockConversation,
      } as Response);

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createConversation("Test conversation");
    });

    expect(created).toEqual(mockConversation);
    expect(result.current.conversations).toEqual([mockConversation]);
    expect(fetch).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test conversation", type: "chat" }),
    });
  });

  it("uses default title when none provided", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockConversation, title: "New conversation" }),
      } as Response);

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createConversation();
    });

    expect(fetch).toHaveBeenCalledWith("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New conversation", type: "chat" }),
    });
  });

  it("deletes a conversation optimistically", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockConversation],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteConversation("conv-1");
    });

    expect(deleted).toBe(true);
    expect(result.current.conversations).toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/api/conversations/conv-1", {
      method: "DELETE",
    });
  });

  it("rolls back on failed delete", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockConversation],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockConversation],
      } as Response);

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    await act(async () => {
      await result.current.deleteConversation("conv-1");
    });

    expect(result.current.error).toBe("Failed to delete conversation");
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
  });
});
