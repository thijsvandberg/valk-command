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

describe("useColumnConfig (headerless tags, BRDG-239)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("loads with default tags when API returns null", async () => {
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.size).toBeGreaterThan(0);
    expect(result.current.visible.has("flag")).toBe(true);
  });

  it("loads an already-migrated tag visibility set as-is", async () => {
    // Skip the one-time corrections so this asserts pure load behaviour.
    localStorage.setItem("sprint-board-poreadiness-default-fix", "true");
    localStorage.setItem("sprint-board-badges-default-fix", "true");
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: [],
      visible: ["flag", "quality"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.has("flag")).toBe(true);
    expect(result.current.visible.has("quality")).toBe(true);
    expect(result.current.visible.has("notes")).toBe(false);
    // No migration write needed for an already-tag set.
    expect(settingsApi.saveColumnConfig).not.toHaveBeenCalled();
  });

  it("migrates a legacy column-visibility set to tags and persists once", async () => {
    // Legacy set with "notes" hidden -> the notes tag must end up hidden.
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: ["key", "title", "flagged", "quality"],
      visible: ["key", "title", "flagged", "quality"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.visible.has("flag")).toBe(true);   // flagged -> flag
    expect(result.current.visible.has("quality")).toBe(true);
    expect(result.current.visible.has("notes")).toBe(false);  // notes column absent -> hidden
    // Tags without a legacy column equivalent default to visible.
    expect(result.current.visible.has("refinement")).toBe(true);
    expect(result.current.visible.has("editState")).toBe(true);

    expect(settingsApi.saveColumnConfig).toHaveBeenCalledWith(
      expect.objectContaining({ visible: expect.arrayContaining(["flag", "quality"]) }),
    );
  });

  it("toggleColumn adds/removes from the visible set", async () => {
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => { result.current.toggleColumn("flag", false); });
    expect(result.current.visible.has("flag")).toBe(false);

    act(() => { result.current.toggleColumn("flag", true); });
    expect(result.current.visible.has("flag")).toBe(true);
  });

  it("adds PO readiness once when a persisted set is missing it (one-time fix)", async () => {
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: [],
      visible: ["flag", "quality"], // tag set without poReadiness
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.has("poReadiness")).toBe(true);
    expect(settingsApi.saveColumnConfig).toHaveBeenCalledWith(
      expect.objectContaining({ visible: expect.arrayContaining(["poReadiness"]) }),
    );
    expect(localStorage.getItem("sprint-board-poreadiness-default-fix")).toBe("true");
  });

  it("adds the SP/BV/epic/assignee badges once when a persisted set predates them (BRDG-299)", async () => {
    // Pre-badge persisted set: the one-time PO readiness fix already ran.
    localStorage.setItem("sprint-board-poreadiness-default-fix", "true");
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: [],
      visible: ["flag", "quality", "poReadiness"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.has("storyPoints")).toBe(true);
    expect(result.current.visible.has("businessValue")).toBe(true);
    expect(result.current.visible.has("epic")).toBe(true);
    expect(result.current.visible.has("assignee")).toBe(true);
    // The user's existing hidden choices are untouched.
    expect(result.current.visible.has("notes")).toBe(false);
    expect(settingsApi.saveColumnConfig).toHaveBeenCalledWith(
      expect.objectContaining({ visible: expect.arrayContaining(["storyPoints", "assignee"]) }),
    );
    expect(localStorage.getItem("sprint-board-badges-default-fix")).toBe("true");
  });

  it("respects a hidden badge once the badges fix has already run (BRDG-299)", async () => {
    localStorage.setItem("sprint-board-poreadiness-default-fix", "true");
    localStorage.setItem("sprint-board-badges-default-fix", "true");
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: [],
      visible: ["flag", "storyPoints"], // assignee deliberately hidden by the user
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.has("storyPoints")).toBe(true);
    expect(result.current.visible.has("assignee")).toBe(false);
    expect(settingsApi.saveColumnConfig).not.toHaveBeenCalled();
  });

  it("resetToDefaults restores the full default tag set", async () => {
    localStorage.setItem("sprint-board-poreadiness-default-fix", "true");
    localStorage.setItem("sprint-board-badges-default-fix", "true");
    vi.mocked(settingsApi.getColumnConfig).mockResolvedValue({
      order: [],
      visible: ["flag"],
    });
    const { result } = renderHook(() => useColumnConfig(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.visible.size).toBe(1);

    act(() => { result.current.resetToDefaults(); });
    expect(result.current.visible.has("notes")).toBe(true);
    expect(result.current.visible.size).toBeGreaterThan(1);
  });
});
