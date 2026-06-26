import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useWorkspaceHealth } from "./useWorkspaceHealth";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorkspaceHealth", () => {
  it("starts in checking state", () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", auth: { status: "valid", tokenExpiresAt: null } }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    expect(result.current.workspace).toBe("checking");
    expect(result.current.claude).toBe("checking");
    expect(result.current.tokenExpiresAt).toBeNull();
  });

  it("reports connected when health endpoint returns OK", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        auth: { status: "valid", tokenExpiresAt: "2026-04-10T00:00:00Z" },
      }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("connected"));

    expect(result.current.claude).toBe("valid");
    expect(result.current.tokenExpiresAt).toBe("2026-04-10T00:00:00Z");
  });

  it("reports unreachable on 502 status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ status: "unreachable" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("unreachable"));

    expect(result.current.claude).toBe("unknown");
    expect(result.current.tokenExpiresAt).toBeNull();
  });

  it("reports unreachable when data.status is unreachable", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "unreachable" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("unreachable"));

    expect(result.current.claude).toBe("unknown");
  });

  it("reports unreachable on network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("unreachable"));

    expect(result.current.claude).toBe("unknown");
    expect(result.current.tokenExpiresAt).toBeNull();
  });

  it("defaults claude to unknown when auth is missing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("connected"));

    expect(result.current.claude).toBe("unknown");
    expect(result.current.tokenExpiresAt).toBeNull();
  });

  it("polls at the configured interval", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: "ok",
          auth: { status: "valid", tokenExpiresAt: null },
        }),
      } as Response);

    renderHook(() => useWorkspaceHealth(5_000));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5_000);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(5_000);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
  });

  it("cleans up interval on unmount", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        auth: { status: "valid", tokenExpiresAt: null },
      }),
    } as Response);

    const { unmount } = renderHook(() => useWorkspaceHealth(5_000));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledTimes(1)
    );

    unmount();

    await vi.advanceTimersByTimeAsync(10_000);

    // No additional calls after unmount (initial call only)
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the tab is hidden, and re-checks on becoming visible", async () => {
    let hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", auth: { status: "valid", tokenExpiresAt: null } }),
    } as Response);

    renderHook(() => useWorkspaceHealth(5_000));

    // The initial mount check always runs (so the UI is never stuck on "checking").
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    // Interval ticks are skipped while hidden.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Becoming visible triggers one immediate re-check.
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("reports expired claude credentials", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "ok",
        auth: { status: "expired", tokenExpiresAt: "2026-04-01T00:00:00Z" },
      }),
    } as Response);

    const { result } = renderHook(() => useWorkspaceHealth());

    await waitFor(() => expect(result.current.workspace).toBe("connected"));

    expect(result.current.claude).toBe("expired");
    expect(result.current.tokenExpiresAt).toBe("2026-04-01T00:00:00Z");
  });
});
