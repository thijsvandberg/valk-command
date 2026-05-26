import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSectionVisibility } from "./useSectionVisibility";

const mockGetSectionVisibility = vi.fn();
const mockSaveSectionVisibility = vi.fn();

vi.mock("@/lib/api-client", () => ({
  settings: {
    getSectionVisibility: (...args: unknown[]) => mockGetSectionVisibility(...args),
    saveSectionVisibility: (...args: unknown[]) => mockSaveSectionVisibility(...args),
  },
}));

describe("useSectionVisibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSectionVisibility.mockResolvedValue({ visible: null });
    mockSaveSectionVisibility.mockResolvedValue({});
  });

  it("starts with default visible fields", () => {
    const { result } = renderHook(() =>
      useSectionVisibility("test-section", ["field1", "field2"]),
    );
    expect(result.current.visible.has("field1")).toBe(true);
    expect(result.current.visible.has("field2")).toBe(true);
  });

  it("loads persisted visibility on mount", async () => {
    mockGetSectionVisibility.mockResolvedValue({ visible: ["field1"] });

    const { result } = renderHook(() =>
      useSectionVisibility("test-section", ["field1", "field2"]),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.visible.has("field1")).toBe(true);
    expect(result.current.visible.has("field2")).toBe(false);
  });

  it("uses defaults when API returns null", async () => {
    const { result } = renderHook(() =>
      useSectionVisibility("test-section", ["field1", "field2"]),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.visible.has("field1")).toBe(true);
    expect(result.current.visible.has("field2")).toBe(true);
  });

  it("toggleField adds and removes fields", () => {
    const { result } = renderHook(() =>
      useSectionVisibility("test-section", ["field1"]),
    );

    act(() => {
      result.current.toggleField("field2", true);
    });
    expect(result.current.visible.has("field2")).toBe(true);

    act(() => {
      result.current.toggleField("field1", false);
    });
    expect(result.current.visible.has("field1")).toBe(false);
  });

  it("handles API errors gracefully on load", async () => {
    mockGetSectionVisibility.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useSectionVisibility("test-section", ["field1"]),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.visible.has("field1")).toBe(true);
  });
});
