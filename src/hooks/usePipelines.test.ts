import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

const mockFetcher = vi.fn();
const mockTick = vi.fn();
const mockRefresh = vi.fn();
const mockFollow = vi.fn();
const mockUnfollow = vi.fn();
const mockListUrl = vi.fn().mockReturnValue("/api/followed-tickets");
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();
const mockClearRead = vi.fn();
const mockDismiss = vi.fn();
const mockMarkFilteredRead = vi.fn();
const mockClearFiltered = vi.fn();
const mockUpdateDeploySettings = vi.fn();

vi.mock("@/lib/api-client", () => ({
  swrFetcher: (...args: unknown[]) => mockFetcher(...args),
  pipelines: {
    tick: (...args: unknown[]) => mockTick(...args),
    refresh: (...args: unknown[]) => mockRefresh(...args),
    updateDeploySettings: (...args: unknown[]) => mockUpdateDeploySettings(...args),
  },
  followedTickets: {
    follow: (...args: unknown[]) => mockFollow(...args),
    unfollow: (...args: unknown[]) => mockUnfollow(...args),
    listUrl: (...args: unknown[]) => mockListUrl(...args),
  },
  notifications: {
    markRead: (...args: unknown[]) => mockMarkRead(...args),
    markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
    clearRead: (...args: unknown[]) => mockClearRead(...args),
    dismiss: (...args: unknown[]) => mockDismiss(...args),
    markFilteredRead: (...args: unknown[]) => mockMarkFilteredRead(...args),
    clearFiltered: (...args: unknown[]) => mockClearFiltered(...args),
  },
}));

import { usePipelines, useFollowedTickets, useFollowTicket } from "./usePipelines";

function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("usePipelines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty runs by default", () => {
    mockFetcher.mockResolvedValue({ runs: [], hasRunning: false });
    const { result } = renderHook(() => usePipelines(), {
      wrapper: swrWrapper,
    });
    expect(result.current.runs).toEqual([]);
    expect(result.current.hasRunning).toBe(false);
    expect(result.current.syncing).toBe(false);
  });

  it("returns pipeline data when available", async () => {
    vi.useRealTimers();
    const mockRuns = [
      { id: "1", state: "SUCCESSFUL", repoSlug: "my-repo" },
    ];
    mockFetcher.mockResolvedValue({
      runs: mockRuns,
      hasRunning: false,
    });

    const { result } = renderHook(() => usePipelines(), {
      wrapper: swrWrapper,
    });

    await waitFor(() => expect(result.current.runs).toHaveLength(1));
    expect(result.current.runs[0].id).toBe("1");
  });

  it("passes filter params to SWR key", async () => {
    vi.useRealTimers();
    mockFetcher.mockResolvedValue({ runs: [], hasRunning: false });

    renderHook(() => usePipelines({ repo: "my-repo", ticketKey: "BT-1" }), {
      wrapper: swrWrapper,
    });

    await waitFor(() =>
      expect(mockFetcher).toHaveBeenCalledWith(
        expect.stringContaining("repo=my-repo"),
      ),
    );
  });

  it("refresh calls pipelinesApi.refresh", async () => {
    mockFetcher.mockResolvedValue({ runs: [], hasRunning: false });
    mockRefresh.mockResolvedValue({});

    const { result } = renderHook(() => usePipelines(), {
      wrapper: swrWrapper,
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe("useFollowedTickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches followed tickets", async () => {
    mockFetcher.mockResolvedValue(["BT-1", "BT-2"]);

    const { result } = renderHook(() => useFollowedTickets(), {
      wrapper: swrWrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(["BT-1", "BT-2"]));
  });
});

describe("useFollowTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("follow calls followedTickets.follow", async () => {
    mockFollow.mockResolvedValue({});
    const { result } = renderHook(() => useFollowTicket(), {
      wrapper: swrWrapper,
    });

    await act(async () => {
      await result.current.follow("BT-1");
    });

    expect(mockFollow).toHaveBeenCalledWith("BT-1");
  });

  it("unfollow calls followedTickets.unfollow", async () => {
    mockUnfollow.mockResolvedValue({});
    const { result } = renderHook(() => useFollowTicket(), {
      wrapper: swrWrapper,
    });

    await act(async () => {
      await result.current.unfollow("BT-1");
    });

    expect(mockUnfollow).toHaveBeenCalledWith("BT-1");
  });
});
