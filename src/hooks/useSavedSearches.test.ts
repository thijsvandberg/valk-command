import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSavedSearches } from "./useSavedSearches";
import { EMPTY_FILTERS } from "@/components/sprint-board/SearchFilterPanel";
import { SWRConfig } from "swr";
import { createElement } from "react";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

describe("useSavedSearches", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty list when API returns empty searches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ searches: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useSavedSearches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.savedSearches).toEqual([]);
  });

  it("deserializes filters so Sets are returned instead of arrays", async () => {
    const serialized = {
      searches: [
        {
          id: "x1",
          label: "Test",
          query: "auth",
          filters: {
            sections: ["tickets"],
            status: ["TO DO"],
            poStatus: [],
            type: [],
            assignee: [],
            sprint: [],
            dateRange: null,
          },
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(serialized), { status: 200 }),
    );

    const { result } = renderHook(() => useSavedSearches(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = result.current.savedSearches[0];
    expect(first.filters.sections).toBeInstanceOf(Set);
    expect(first.filters.sections.has("tickets")).toBe(true);
    expect(first.filters.status).toBeInstanceOf(Set);
    expect(first.filters.status.has("TO DO")).toBe(true);
  });

  it("saveSearch calls PUT with serialized filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ searches: [] }), { status: 200 }),
    );

    const { result } = renderHook(() => useSavedSearches(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveSearch("My search", "auth bug", {
        ...EMPTY_FILTERS,
        status: new Set(["IN PROGRESS"]),
      });
    });

    const putCall = fetchMock.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("saved-searches") && (args[1] as RequestInit)?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.searches[0].query).toBe("auth bug");
    // Filters must be serialized to arrays
    expect(Array.isArray(body.searches[0].filters.status)).toBe(true);
    expect(body.searches[0].filters.status).toContain("IN PROGRESS");
  });

  it("deleteSearch removes the entry by id", async () => {
    const initial = {
      searches: [
        { id: "a", label: "A", query: "foo", filters: { sections: [], status: [], poStatus: [], type: [], assignee: [], sprint: [], dateRange: null } },
        { id: "b", label: "B", query: "bar", filters: { sections: [], status: [], poStatus: [], type: [], assignee: [], sprint: [], dateRange: null } },
      ],
    };

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(initial), { status: 200 }),
    );

    const { result } = renderHook(() => useSavedSearches(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.savedSearches).toHaveLength(2);

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ searches: [initial.searches[1]] }), { status: 200 }),
    );

    await act(async () => {
      await result.current.deleteSearch("a");
    });

    const putCall = fetchMock.mock.calls.find(
      (args) => typeof args[0] === "string" && args[0].includes("saved-searches") && (args[1] as RequestInit)?.method === "PUT",
    );
    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.searches.find((s: { id: string }) => s.id === "a")).toBeUndefined();
  });

  it("reports isFull when 10 searches exist", async () => {
    const full = {
      searches: Array.from({ length: 10 }, (_, i) => ({
        id: `id-${i}`,
        label: `Search ${i}`,
        query: `q${i}`,
        filters: { sections: [], status: [], poStatus: [], type: [], assignee: [], sprint: [], dateRange: null },
      })),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(full), { status: 200 }),
    );

    const { result } = renderHook(() => useSavedSearches(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFull).toBe(true);
  });
});
