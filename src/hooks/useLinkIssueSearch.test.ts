import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const recentlyUpdated = vi.fn();
const searchForLink = vi.fn();
const searchForLinkWithJira = vi.fn();

vi.mock("@/lib/api-client", () => ({
  tickets: {
    recentlyUpdated: (...args: unknown[]) => recentlyUpdated(...args),
    searchForLink: (...args: unknown[]) => searchForLink(...args),
    searchForLinkWithJira: (...args: unknown[]) => searchForLinkWithJira(...args),
  },
}));

import { useLinkIssueSearch } from "./useLinkIssueSearch";

describe("useLinkIssueSearch unmount hygiene (BRDG-410)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    recentlyUpdated.mockResolvedValue({ results: [], hasMore: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a pending debounce on unmount so no search fires", async () => {
    const { result, unmount } = renderHook(() => useLinkIssueSearch("VPL-1"));

    act(() => {
      result.current.setQuery("hello");
    });

    // Unmount before the 200ms debounce elapses.
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(searchForLink).not.toHaveBeenCalled();
  });

  it("aborts the in-flight request on unmount and runs no setState afterwards", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveSearch: ((value: unknown) => void) | undefined;

    searchForLink.mockImplementation((_q, _key, _offset, _filters, signal: AbortSignal) => {
      capturedSignal = signal;
      return new Promise((res) => {
        resolveSearch = res;
      });
    });

    const { result, unmount } = renderHook(() => useLinkIssueSearch("VPL-1"));

    act(() => {
      result.current.setQuery("hello");
    });

    // Fire the 200ms debounce so the fetch starts and the abort controller is set.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(searchForLink).toHaveBeenCalledTimes(1);
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    // Resolving the request after unmount must not throw or setState: the
    // controller.signal.aborted guard inside doSearch returns early.
    await act(async () => {
      resolveSearch?.({ results: [{ key: "VPL-2" }], hasMore: false });
      await Promise.resolve();
    });
  });
});
