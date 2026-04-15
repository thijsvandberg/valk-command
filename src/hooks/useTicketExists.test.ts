import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTicketExists } from "./useTicketExists";

describe("useTicketExists", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading false when key is null", () => {
    const { result } = renderHook(() => useTicketExists(null));
    expect(result.current.exists).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("returns exists=true with status when ticket is found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ jiraStatus: "IN PROGRESS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { result } = renderHook(() => useTicketExists("VPL-99999"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.exists).toBe(true);
    expect(result.current.status).toBe("IN PROGRESS");
  });

  it("returns exists=false when ticket is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );

    const { result } = renderHook(() => useTicketExists("VPL-88888"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.exists).toBe(false);
    expect(result.current.status).toBeNull();
  });

  it("returns exists=false on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useTicketExists("VPL-77777"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.exists).toBe(false);
  });
});
