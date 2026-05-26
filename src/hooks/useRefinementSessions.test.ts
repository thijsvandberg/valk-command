import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUseSWR = vi.fn();

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/api-client", () => ({
  swrFetcher: vi.fn(),
  refinementSessions: {
    listUrl: () => "/api/refinement-sessions",
  },
}));

import { useRefinementSessions } from "./useRefinementSessions";

describe("useRefinementSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty sessions array when data is undefined", () => {
    mockUseSWR.mockReturnValue({ data: undefined, mutate: vi.fn(), isLoading: true });
    const { result } = renderHook(() => useRefinementSessions());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns sessions from SWR data", () => {
    const sessions = [{ id: "1", name: "Session 1" }];
    mockUseSWR.mockReturnValue({ data: sessions, mutate: vi.fn(), isLoading: false });
    const { result } = renderHook(() => useRefinementSessions());
    expect(result.current.sessions).toEqual(sessions);
    expect(result.current.isLoading).toBe(false);
  });

  it("passes correct SWR key", () => {
    mockUseSWR.mockReturnValue({ data: undefined, mutate: vi.fn(), isLoading: false });
    renderHook(() => useRefinementSessions());
    expect(mockUseSWR.mock.calls[0][0]).toBe("/api/refinement-sessions");
  });
});
