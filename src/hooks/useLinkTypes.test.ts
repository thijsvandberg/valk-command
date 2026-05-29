import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/api-client", () => ({
  jira: { linkTypesUrl: () => "/api/jira/link-types" },
  swrFetcher: vi.fn(),
}));

import { useLinkTypes, FALLBACK_LINK_TYPES } from "./useLinkTypes";
import { swrFetcher } from "@/lib/api-client";

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useLinkTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fallback link types when data is undefined", () => {
    vi.mocked(swrFetcher).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useLinkTypes(), { wrapper });
    expect(result.current.linkTypes).toEqual(FALLBACK_LINK_TYPES);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns API data when loaded", async () => {
    const apiTypes = [{ value: "blocks", label: "Blocks", jiraTypeName: "Blocks", direction: "outward" }];
    vi.mocked(swrFetcher).mockResolvedValue({ linkTypes: apiTypes });

    const { result } = renderHook(() => useLinkTypes(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.linkTypes).toEqual(apiTypes);
  });

  it("returns error state when fetch fails", async () => {
    vi.mocked(swrFetcher).mockRejectedValue(new Error("fetch failed"));

    const { result } = renderHook(() => useLinkTypes(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.linkTypes).toEqual(FALLBACK_LINK_TYPES);
  });

  it("returns loading state initially", () => {
    vi.mocked(swrFetcher).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useLinkTypes(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("FALLBACK_LINK_TYPES contains expected entries", () => {
    expect(FALLBACK_LINK_TYPES.length).toBeGreaterThan(0);
    const values = FALLBACK_LINK_TYPES.map((t) => t.value);
    expect(values).toContain("relates to");
    expect(values).toContain("blocks");
  });
});
