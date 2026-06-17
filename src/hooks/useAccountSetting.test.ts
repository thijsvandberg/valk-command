import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement } from "react";
import { useAccountSetting } from "./useAccountSetting";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

const URL = "/api/settings/test-sort";

function mockServer(serverValue: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if ((init as RequestInit | undefined)?.method === "PUT") {
      const body = JSON.parse((init as RequestInit).body as string);
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ value: serverValue }), { status: 200 }));
  });
}

type Sort = { field: string; direction: string };
const DEFAULT: Sort = { field: "rank", direction: "asc" };

describe("useAccountSetting object writes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The setter resolves functional updates against a ref that only refreshes
  // between renders, so two partial updates fired in the same tick both read the
  // same stale value and the second overwrites the first. This is why a metric
  // sort (field + direction) must be written in one call, not two.
  it("loses the first field when two partial updates fire in the same tick", async () => {
    mockServer(DEFAULT);
    const { result } = renderHook(() => useAccountSetting<Sort>(URL, DEFAULT), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setValue((prev) => ({ ...prev, field: "points" }));
      result.current.setValue((prev) => ({ ...prev, direction: "desc" }));
    });

    // The field write is clobbered: only the direction from the second call survives.
    expect(result.current.value).toEqual({ field: "rank", direction: "desc" });
  });

  it("persists both fields when written in a single combined update", async () => {
    mockServer(DEFAULT);
    const { result } = renderHook(() => useAccountSetting<Sort>(URL, DEFAULT), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setValue({ field: "points", direction: "desc" });
    });

    expect(result.current.value).toEqual({ field: "points", direction: "desc" });
  });
});
