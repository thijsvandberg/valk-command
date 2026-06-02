import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/api-client", () => ({
  settings: {
    getColumnConfig: vi.fn().mockResolvedValue({ order: null, visible: null }),
    saveColumnConfig: vi.fn().mockResolvedValue({}),
  },
}));

import { useColumnConfig } from "./useColumnConfig";
import { settings as settingsApi } from "@/lib/api-client";

function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useColumnConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
  });

  it("loads with defaults when API returns null", async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useColumnConfig(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.order.length).toBeGreaterThan(0);
    expect(result.current.visible.size).toBeGreaterThan(0);
  });

  it("loads saved column config from API", async () => {
    vi.useRealTimers();
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: ["key", "title", "type"],
      visible: ["key", "title"],
    });
    const { result } = renderHook(() => useColumnConfig(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.order[0]).toBe("key");
    expect(result.current.visible.has("key" as never)).toBe(true);
    expect(result.current.visible.has("title" as never)).toBe(true);
  });

  it("strips the pipeline column once from a previously persisted visible set (BRDG-251)", async () => {
    vi.useRealTimers();
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: ["key", "title", "pipeline", "assignee"],
      visible: ["key", "title", "pipeline", "assignee"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.visible.has("pipeline" as never)).toBe(false);
    expect(result.current.visible.has("assignee" as never)).toBe(true);
    // The cleaned set is persisted back so the change sticks.
    expect(settingsApi.saveColumnConfig).toHaveBeenCalledWith(
      expect.objectContaining({ visible: expect.not.arrayContaining(["pipeline"]) }),
    );
    expect(localStorage.getItem("sprint-board-pipeline-col-migrated")).toBe("true");
  });

  it("does not re-strip pipeline once the migration has already run", async () => {
    vi.useRealTimers();
    localStorage.setItem("sprint-board-pipeline-col-migrated", "true");
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: ["key", "title", "pipeline"],
      visible: ["key", "title", "pipeline"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    // User re-added pipeline after migration; it must be respected.
    expect(result.current.visible.has("pipeline" as never)).toBe(true);
    expect(settingsApi.saveColumnConfig).not.toHaveBeenCalled();
  });

  it("toggleColumn adds/removes from visible set", async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useColumnConfig(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const firstCol = result.current.order[0];

    act(() => {
      result.current.toggleColumn(firstCol, false);
    });
    expect(result.current.visible.has(firstCol)).toBe(false);

    act(() => {
      result.current.toggleColumn(firstCol, true);
    });
    expect(result.current.visible.has(firstCol)).toBe(true);
  });

  it("resetToDefaults restores default config", async () => {
    vi.useRealTimers();
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: ["type", "key"],
      visible: ["type"],
    });
    const { result } = renderHook(() => useColumnConfig(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    const initialOrderLength = result.current.order.length;

    act(() => {
      result.current.resetToDefaults();
    });

    expect(result.current.order.length).toBeGreaterThanOrEqual(initialOrderLength);
  });
});
