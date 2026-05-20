import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

const mockFetcher = vi.fn();

vi.mock("@/lib/api-client", () => ({
  swrFetcher: (...args: unknown[]) => mockFetcher(...args),
}));

import { useVelocityData } from "./useVelocityData";

function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useVelocityData", () => {
  it("does not fetch when teamPrefix is null", () => {
    const { result } = renderHook(() => useVelocityData(null), {
      wrapper: swrWrapper,
    });
    expect(result.current.data).toBeNull();
    expect(mockFetcher).not.toHaveBeenCalled();
  });

  it("fetches velocity data for a team", async () => {
    const mockData = [
      { sprintId: 1, sprintName: "BT: Sprint 1", completedPoints: 20 },
      { sprintId: 2, sprintName: "BT: Sprint 2", completedPoints: 25 },
    ];
    mockFetcher.mockResolvedValue(mockData);

    const { result } = renderHook(() => useVelocityData("BT"), {
      wrapper: swrWrapper,
    });

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual(mockData);
  });

  it("includes limit in the SWR key", async () => {
    mockFetcher.mockResolvedValue([]);

    renderHook(() => useVelocityData("BT", 5), {
      wrapper: swrWrapper,
    });

    await waitFor(() =>
      expect(mockFetcher).toHaveBeenCalledWith(
        expect.stringContaining("limit=5"),
      ),
    );
  });
});
