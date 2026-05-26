import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockDraftStatus = vi.fn();
const mockRetryDraft = vi.fn();

vi.mock("@/lib/api-client", () => ({
  storyWriter: {
    draftStatus: (...args: unknown[]) => mockDraftStatus(...args),
    retryDraft: (...args: unknown[]) => mockRetryDraft(...args),
  },
}));

import { useDraftSync } from "./useDraftSync";

describe("useDraftSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRetryDraft.mockResolvedValue({});
  });

  it("returns idle status for non-DRAFT keys", () => {
    const { result } = renderHook(() => useDraftSync("VPL-123"));
    expect(result.current.syncStatus).toBe("idle");
    expect(result.current.realKey).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("returns pending status initially for DRAFT keys", () => {
    mockDraftStatus.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDraftSync("DRAFT-abc"));
    expect(result.current.syncStatus).toBe("pending");
  });

  it("transitions to synced when API returns synced status", async () => {
    mockDraftStatus.mockResolvedValue({ status: "synced", realKey: "VPL-456" });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});

    const { result } = renderHook(() => useDraftSync("DRAFT-abc"));

    await waitFor(() => {
      expect(result.current.syncStatus).toBe("synced");
    });

    expect(result.current.realKey).toBe("VPL-456");
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/tickets/VPL-456/write");
    replaceStateSpy.mockRestore();
  });

  it("transitions to error when API returns error status", async () => {
    mockDraftStatus.mockResolvedValue({ status: "error", error: "Jira creation failed" });

    const { result } = renderHook(() => useDraftSync("DRAFT-abc"));

    await waitFor(() => {
      expect(result.current.syncStatus).toBe("error");
    });

    expect(result.current.error).toBe("Jira creation failed");
  });

  it("retry resets to pending and calls retryDraft", async () => {
    mockDraftStatus.mockResolvedValue({ status: "error", error: "fail" });

    const { result } = renderHook(() => useDraftSync("DRAFT-abc"));

    await waitFor(() => {
      expect(result.current.syncStatus).toBe("error");
    });

    mockDraftStatus.mockReturnValue(new Promise(() => {}));

    act(() => {
      result.current.retry();
    });

    expect(result.current.syncStatus).toBe("pending");
    expect(mockRetryDraft).toHaveBeenCalledWith({ draftKey: "DRAFT-abc" });
  });

  it("retry is a no-op for non-DRAFT keys", () => {
    const { result } = renderHook(() => useDraftSync("VPL-123"));
    act(() => {
      result.current.retry();
    });
    expect(mockRetryDraft).not.toHaveBeenCalled();
  });
});
