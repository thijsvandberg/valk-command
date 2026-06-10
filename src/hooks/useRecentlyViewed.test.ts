import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRecentlyViewed } from "./useRecentlyViewed";
import { RECENTLY_VIEWED_KEY, recordTicketView } from "@/lib/recently-viewed-store";

beforeEach(() => {
  localStorage.clear();
});

describe("useRecentlyViewed", () => {
  it("returns the stored entries on mount", () => {
    recordTicketView("VPL-1", "First");

    const { result } = renderHook(() => useRecentlyViewed());
    expect(result.current.map((e) => e.key)).toEqual(["VPL-1"]);
  });

  it("updates when a view is recorded in the same tab", () => {
    const { result } = renderHook(() => useRecentlyViewed());
    expect(result.current).toEqual([]);

    act(() => {
      recordTicketView("VPL-2", "Second");
    });

    expect(result.current.map((e) => e.key)).toEqual(["VPL-2"]);
  });

  it("updates on a cross-tab storage event for the store key", () => {
    const { result } = renderHook(() => useRecentlyViewed());

    act(() => {
      localStorage.setItem(
        RECENTLY_VIEWED_KEY,
        JSON.stringify([{ key: "VPL-3", title: "Other tab", viewedAt: 1 }]),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: RECENTLY_VIEWED_KEY }),
      );
    });

    expect(result.current.map((e) => e.key)).toEqual(["VPL-3"]);
  });

  it("ignores storage events for unrelated keys", () => {
    recordTicketView("VPL-1", "First");
    const { result } = renderHook(() => useRecentlyViewed());
    const before = result.current;

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "other-key" }));
    });

    expect(result.current).toBe(before);
  });
});
