import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Spies shared with the module mocks (hoisted so the vi.mock factories can use them).
const h = vi.hoisted(() => ({
  follow: vi.fn(() => Promise.resolve()),
  unfollow: vi.fn(() => Promise.resolve()),
  updateStoryPoints: vi.fn(() => Promise.resolve()),
  updateMetadata: vi.fn(() => Promise.resolve()),
  updateEpic: vi.fn(() => Promise.resolve()),
  moveSprint: vi.fn(() => Promise.resolve()),
  assign: vi.fn(() => Promise.resolve()),
  mutate: vi.fn(() => Promise.resolve()),
  bulkReviewStories: vi.fn(() => Promise.resolve()),
}));

vi.mock("swr", () => ({ mutate: h.mutate }));
vi.mock("@/lib/api-client", () => ({
  tickets: { updateStoryPoints: h.updateStoryPoints, updateMetadata: h.updateMetadata, updateEpic: h.updateEpic },
  jira: { moveSprint: h.moveSprint, assign: h.assign },
}));
vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({ sprints: [{ id: 42, name: "BT 1", state: "active", startDate: null, endDate: null }] }),
}));
let followedList = ["VPL-FOLLOWED"];
vi.mock("@/hooks/usePipelines", () => ({
  useFollowedTickets: () => ({ data: followedList }),
  useFollowTicket: () => ({ follow: h.follow, unfollow: h.unfollow }),
}));
vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  mapJiraSprints: (raw: { id: number; name: string; state: string }[] | undefined) =>
    (raw ?? []).map((s) => ({ id: String(s.id), name: s.name, dateRange: "", state: s.state, ticketCount: 0 })),
  bulkReviewStories: h.bulkReviewStories,
}));

import { useHoverCardEdits } from "./useHoverCardEdits";

// Run a handler and let its persist() chain (optimistic patch -> API -> revalidate) settle.
async function flush(fn: () => void) {
  await act(async () => {
    fn();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useHoverCardEdits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followedList = ["VPL-FOLLOWED"];
  });

  it("maps the raw sprints to the picker shape", () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    expect(result.current.sprints).toEqual([
      { id: "42", name: "BT 1", dateRange: "", state: "active", ticketCount: 0 },
    ]);
  });

  it("persists story points and revalidates", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => result.current.onStoryPointsChange(8));
    expect(h.updateStoryPoints).toHaveBeenCalledWith("VPL-1", 8);
    expect(h.mutate).toHaveBeenCalled();
  });

  it("persists business value via metadata", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => result.current.onBusinessValueChange(5));
    expect(h.updateMetadata).toHaveBeenCalledWith("VPL-1", { businessValue: 5 });
  });

  it("moves to a sprint, and to the backlog for null", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => result.current.onSprintChange("42"));
    expect(h.moveSprint).toHaveBeenCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "42" });
    await flush(() => result.current.onSprintChange(null));
    expect(h.moveSprint).toHaveBeenLastCalledWith({ issueKeys: ["VPL-1"], targetSprintId: "__backlog__" });
  });

  it("updates the epic, and clears it for null", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => result.current.onEpicChange({ key: "VPL-100", name: "Onboarding" }));
    expect(h.updateEpic).toHaveBeenCalledWith("VPL-1", "VPL-100");
    await flush(() => result.current.onEpicChange(null));
    expect(h.updateEpic).toHaveBeenLastCalledWith("VPL-1", null);
  });

  it("assigns by account id and unassigns for null", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => result.current.onAssigneeChange({ accountId: "acc-1", displayName: "Zoe", avatarUrl: null }));
    expect(h.assign).toHaveBeenCalledWith({ issueKey: "VPL-1", accountId: "acc-1", name: "Zoe" });
    await flush(() => result.current.onAssigneeChange(null));
    expect(h.assign).toHaveBeenLastCalledWith({ issueKey: "VPL-1", accountId: null, name: null });
  });

  it("reflects followed state and toggles accordingly", async () => {
    const followed = renderHook(() => useHoverCardEdits("VPL-FOLLOWED"));
    expect(followed.result.current.isFollowed).toBe(true);
    await flush(() => followed.result.current.onToggleFollow());
    expect(h.unfollow).toHaveBeenCalledWith("VPL-FOLLOWED");

    const notFollowed = renderHook(() => useHoverCardEdits("VPL-1"));
    expect(notFollowed.result.current.isFollowed).toBe(false);
    await flush(() => notFollowed.result.current.onToggleFollow());
    expect(h.follow).toHaveBeenCalledWith("VPL-1");
  });

  it("runs a single-ticket review", async () => {
    const { result } = renderHook(() => useHoverCardEdits("VPL-1"));
    await flush(() => { void result.current.onRunReview(); });
    expect(h.bulkReviewStories).toHaveBeenCalledWith(["VPL-1"]);
  });
});
