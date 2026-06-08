import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSidebarData } from "./useSidebarData";

const mockUseJiraSprints = vi.fn();
const mockUseTickets = vi.fn();
const mockUseActiveWriterSessions = vi.fn();
const mockUseConversations = vi.fn();

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => mockUseJiraSprints(),
  useTickets: (sprintId: string | null) => mockUseTickets(sprintId),
  useActiveWriterSessions: () => mockUseActiveWriterSessions(),
}));

vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => mockUseConversations(),
}));

function ticket(overrides: Record<string, unknown>) {
  return {
    key: "VPL-1",
    jiraStatus: "TO DO",
    readiness: null,
    storyPoints: null,
    businessValue: null,
    type: "story",
    ...overrides,
  };
}

describe("useSidebarData", () => {
  beforeEach(() => {
    mockUseJiraSprints.mockReturnValue({ sprints: [] });
    mockUseTickets.mockReturnValue({ data: undefined });
    mockUseActiveWriterSessions.mockReturnValue({ data: undefined });
    mockUseConversations.mockReturnValue({ conversations: [], loading: false });
  });

  it("returns null hero when there is no active sprint", () => {
    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero).toBeNull();
  });

  it("derives hero counts, progress and day X/Y from the active sprint", () => {
    mockUseJiraSprints.mockReturnValue({
      sprints: [
        { id: 99, name: "BT: 139", state: "closed", startDate: null, endDate: null, goal: null },
        { id: 100, name: "BT: 140", state: "active", startDate: "2026-06-01", endDate: "2026-06-12", goal: null },
      ],
    });
    mockUseTickets.mockReturnValue({
      data: [
        ticket({ jiraStatus: "TO DO" }),
        ticket({ jiraStatus: "TO DO" }),
        ticket({ jiraStatus: "IN PROGRESS" }),
        ticket({ jiraStatus: "DONE" }),
      ],
    });

    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero?.sprintKey).toBe("BT: 140");
    expect(result.current.hero?.todo).toBe(2);
    expect(result.current.hero?.inProgress).toBe(1);
    expect(result.current.hero?.done).toBe(1);
    // 1 done out of 4 total.
    expect(result.current.hero?.progress).toBeCloseTo(0.25);
    expect(result.current.hero?.dayY).toBeGreaterThan(0);
    expect(result.current.hero?.dayX).not.toBeNull();
  });

  it("hero progress is null when the active sprint has no tickets yet", () => {
    mockUseJiraSprints.mockReturnValue({
      sprints: [{ id: 100, name: "BT: 140", state: "active", startDate: null, endDate: null, goal: null }],
    });
    mockUseTickets.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero).not.toBeNull();
    expect(result.current.hero?.progress).toBeNull();
  });

  it("counts only unread conversations for the chat row", () => {
    mockUseConversations.mockReturnValue({
      conversations: [
        { id: "a", readAt: null },
        { id: "b", readAt: "2026-06-01T00:00:00Z" },
        { id: "c", readAt: null },
      ],
      loading: false,
    });
    const { result } = renderHook(() => useSidebarData());
    expect(result.current.chat).toEqual({ count: 2, note: "unread" });
  });

  it("returns label-only chat count while conversations are loading", () => {
    mockUseConversations.mockReturnValue({ conversations: [], loading: true });
    const { result } = renderHook(() => useSidebarData());
    expect(result.current.chat.count).toBeNull();
  });

  it("counts active writer sessions as drafts, null while loading", () => {
    mockUseActiveWriterSessions.mockReturnValue({ data: [{}, {}, {}] });
    expect(renderHook(() => useSidebarData()).result.current.storyWriter).toEqual({ count: 3, note: "drafts" });

    mockUseActiveWriterSessions.mockReturnValue({ data: undefined });
    expect(renderHook(() => useSidebarData()).result.current.storyWriter.count).toBeNull();
  });

  it("counts ready_to_refine tickets for the refinement row, null while loading", () => {
    mockUseJiraSprints.mockReturnValue({
      sprints: [{ id: 100, name: "BT: 140", state: "active", startDate: null, endDate: null, goal: null }],
    });
    mockUseTickets.mockReturnValue({
      data: [
        ticket({ readiness: "ready_to_refine" }),
        ticket({ readiness: "drafting" }),
        ticket({ readiness: "ready_to_refine" }),
      ],
    });
    expect(renderHook(() => useSidebarData()).result.current.refinement).toEqual({ count: 2, note: "to refine" });

    mockUseTickets.mockReturnValue({ data: undefined });
    expect(renderHook(() => useSidebarData()).result.current.refinement.count).toBeNull();
  });
});
