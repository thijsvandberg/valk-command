import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { createElement, type ReactNode } from "react";

vi.mock("@/lib/api-client", () => ({
  settings: {
    getColumnWidths: vi.fn().mockResolvedValue({ widths: {} }),
    saveColumnWidths: vi.fn().mockResolvedValue({}),
  },
}));

import { useColumnWidths, DEFAULT_COLUMN_WIDTHS } from "./useColumnWidths";
import { settings as settingsApi } from "@/lib/api-client";

function swrWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );
}

describe("useColumnWidths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default empty widths on load", async () => {
    const { result } = renderHook(() => useColumnWidths(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.widths).toEqual({});
  });

  it("loads saved widths from API", async () => {
    vi.mocked(settingsApi.getColumnWidths).mockResolvedValue({
      widths: { key: 120, title: 400 },
    });
    const { result } = renderHook(() => useColumnWidths(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.widths).toEqual({ key: 120, title: 400 });
  });

  it("sets a column width", async () => {
    const { result } = renderHook(() => useColumnWidths(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.setColumnWidth("key", 150);
    });

    expect(result.current.widths.key).toBe(150);
  });

  it("resets a column width", async () => {
    vi.mocked(settingsApi.getColumnWidths).mockResolvedValue({
      widths: { key: 120 },
    });
    const { result } = renderHook(() => useColumnWidths(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.resetColumnWidth("key");
    });

    expect(result.current.widths.key).toBeUndefined();
  });

  it("getWidth returns stored or undefined", async () => {
    vi.mocked(settingsApi.getColumnWidths).mockResolvedValue({
      widths: { key: 120 },
    });
    const { result } = renderHook(() => useColumnWidths(), {
      wrapper: swrWrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.getWidth("key")).toBe(120);
    expect(result.current.getWidth("nonexistent")).toBeUndefined();
  });
});

describe("DEFAULT_COLUMN_WIDTHS", () => {
  it("provides default widths for known columns", () => {
    expect(DEFAULT_COLUMN_WIDTHS.key).toBeDefined();
    expect(DEFAULT_COLUMN_WIDTHS.title).toBeDefined();
    expect(DEFAULT_COLUMN_WIDTHS.type).toBeDefined();
  });
});
