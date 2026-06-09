import { describe, it, expect, beforeEach, vi } from "vitest";
import { readSidebarSnapshot, writeSidebarSnapshot } from "./sidebar-snapshot";
import type { SidebarData } from "@/hooks/useSidebarData";

const SAMPLE: SidebarData = {
  hero: {
    sprintKey: "BT: 139",
    todo: 8,
    inProgress: 5,
    done: 2,
    progress: 0.13,
    dayX: 2,
    dayY: 10,
  },
  chat: { count: 35, note: "unread" },
  storyWriter: { count: 9, note: "drafts" },
  refinement: { count: 4, note: "to refine" },
};

describe("sidebar-snapshot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a snapshot through localStorage", () => {
    writeSidebarSnapshot(SAMPLE);
    expect(readSidebarSnapshot()).toEqual(SAMPLE);
  });

  it("returns null when nothing has been persisted", () => {
    expect(readSidebarSnapshot()).toBeNull();
  });

  it("returns null on corrupt JSON instead of throwing", () => {
    window.localStorage.setItem("bridge.sidebar-snapshot.v1", "{not json");
    expect(readSidebarSnapshot()).toBeNull();
  });

  it("preserves a null hero (no active sprint)", () => {
    const noSprint: SidebarData = { ...SAMPLE, hero: null };
    writeSidebarSnapshot(noSprint);
    expect(readSidebarSnapshot()?.hero).toBeNull();
  });

  it("swallows write failures (e.g. quota exceeded)", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeSidebarSnapshot(SAMPLE)).not.toThrow();
  });
});
