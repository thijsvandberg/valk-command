import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RECENTLY_VIEWED_KEY,
  RECENTLY_VIEWED_EVENT,
  MAX_RECENTLY_VIEWED,
  readRecentlyViewed,
  recordTicketView,
  getRecentlyViewedSnapshot,
} from "./recently-viewed-store";

beforeEach(() => {
  localStorage.clear();
});

describe("recordTicketView", () => {
  it("prepends new entries most-recent-first", () => {
    recordTicketView("VPL-1", "First");
    recordTicketView("VPL-2", "Second");

    const entries = readRecentlyViewed();
    expect(entries.map((e) => e.key)).toEqual(["VPL-2", "VPL-1"]);
    expect(entries[0].title).toBe("Second");
    expect(entries[0].viewedAt).toBeTypeOf("number");
  });

  it("moves a re-viewed ticket to the top without duplicating it", () => {
    recordTicketView("VPL-1", "First");
    recordTicketView("VPL-2", "Second");
    recordTicketView("VPL-1", "First");

    const entries = readRecentlyViewed();
    expect(entries.map((e) => e.key)).toEqual(["VPL-1", "VPL-2"]);
    expect(entries).toHaveLength(2);
  });

  it("caps the list at MAX_RECENTLY_VIEWED, evicting the oldest", () => {
    for (let i = 1; i <= MAX_RECENTLY_VIEWED + 1; i++) {
      recordTicketView(`VPL-${i}`, `Ticket ${i}`);
    }

    const entries = readRecentlyViewed();
    expect(entries).toHaveLength(MAX_RECENTLY_VIEWED);
    expect(entries[0].key).toBe(`VPL-${MAX_RECENTLY_VIEWED + 1}`);
    expect(entries.some((e) => e.key === "VPL-1")).toBe(false);
  });

  it("carries the previous title forward when a re-view has no title", () => {
    recordTicketView("VPL-1", "Known title");
    recordTicketView("VPL-1");

    expect(readRecentlyViewed()[0].title).toBe("Known title");
  });

  it("updates the title when a re-view provides a new one", () => {
    recordTicketView("VPL-1", "Old title");
    recordTicketView("VPL-1", "New title");

    expect(readRecentlyViewed()[0].title).toBe("New title");
  });

  it("ignores empty keys", () => {
    recordTicketView("");
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("dispatches the same-tab change event", () => {
    const listener = vi.fn();
    window.addEventListener(RECENTLY_VIEWED_EVENT, listener);
    recordTicketView("VPL-1", "First");
    window.removeEventListener(RECENTLY_VIEWED_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("readRecentlyViewed", () => {
  it("returns [] when nothing is stored", () => {
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("returns [] on invalid JSON without throwing", () => {
    localStorage.setItem(RECENTLY_VIEWED_KEY, "{not json");
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("returns [] when the stored value is not an array", () => {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify({ key: "VPL-1" }));
    expect(readRecentlyViewed()).toEqual([]);
  });

  it("skips malformed entries and keeps valid ones", () => {
    localStorage.setItem(
      RECENTLY_VIEWED_KEY,
      JSON.stringify([
        { key: "VPL-1", title: "Valid", viewedAt: 123 },
        { key: 42, viewedAt: 456 },
        { title: "No key", viewedAt: 789 },
        null,
        "VPL-2",
        { key: "", viewedAt: 1 },
        { key: "VPL-3", viewedAt: "not-a-number" },
      ]),
    );

    const entries = readRecentlyViewed();
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("VPL-1");
  });
});

describe("getRecentlyViewedSnapshot", () => {
  it("returns a stable reference while storage is unchanged", () => {
    recordTicketView("VPL-1", "First");
    const a = getRecentlyViewedSnapshot();
    const b = getRecentlyViewedSnapshot();
    expect(a).toBe(b);
  });

  it("returns a fresh value after a write", () => {
    recordTicketView("VPL-1", "First");
    const a = getRecentlyViewedSnapshot();
    recordTicketView("VPL-2", "Second");
    const b = getRecentlyViewedSnapshot();
    expect(b).not.toBe(a);
    expect(b[0].key).toBe("VPL-2");
  });
});
