import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSidebarData } from "./useSidebarData";

const mockUseJiraSprints = vi.fn();
const mockUseTickets = vi.fn();
const mockUseActiveWriterSessions = vi.fn();
const mockUseConversations = vi.fn();
const mockUseDefaultSprintId = vi.fn();
const mockUseRefinementSessions = vi.fn();

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => mockUseJiraSprints(),
  useTickets: (sprintId: string | null) => mockUseTickets(sprintId),
  useActiveWriterSessions: () => mockUseActiveWriterSessions(),
}));

vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => mockUseConversations(),
}));

vi.mock("@/hooks/useDefaultSprint", () => ({
  useDefaultSprintId: () => mockUseDefaultSprintId(),
}));

vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => mockUseRefinementSessions(),
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
    mockUseDefaultSprintId.mockReturnValue(null);
    mockUseRefinementSessions.mockReturnValue({ sessions: [], isLoading: false });
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

  it("uses the active sprint of the default team, following the rollover", () => {
    // Default is pinned to a closed BT sprint; the active BT sprint should win.
    mockUseJiraSprints.mockReturnValue({
      sprints: [
        { id: 100, name: "BM: 139", state: "active", startDate: null, endDate: null, goal: null },
        { id: 101, name: "BT: 139", state: "closed", startDate: null, endDate: null, goal: null },
        { id: 102, name: "BT: 140", state: "active", startDate: null, endDate: null, goal: null },
      ],
    });
    mockUseDefaultSprintId.mockReturnValue("101");

    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero?.sprintKey).toBe("BT: 140");
    // Tickets are fetched for the active sprint of the default team.
    expect(mockUseTickets).toHaveBeenCalledWith("102");
  });

  it("falls back to the pinned sprint when the default team has none active", () => {
    mockUseJiraSprints.mockReturnValue({
      sprints: [
        { id: 100, name: "BM: 139", state: "active", startDate: null, endDate: null, goal: null },
        { id: 101, name: "BT: 139", state: "closed", startDate: null, endDate: null, goal: null },
      ],
    });
    mockUseDefaultSprintId.mockReturnValue("101");

    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero?.sprintKey).toBe("BT: 139");
  });

  it("falls back to any active sprint when the default sprint is missing from the list", () => {
    mockUseJiraSprints.mockReturnValue({
      sprints: [{ id: 100, name: "BM: 139", state: "active", startDate: null, endDate: null, goal: null }],
    });
    mockUseDefaultSprintId.mockReturnValue("999");

    const { result } = renderHook(() => useSidebarData());
    expect(result.current.hero?.sprintKey).toBe("BM: 139");
  });

  it("counts tickets in the next refinement session, preferring in_progress over draft", () => {
    mockUseRefinementSessions.mockReturnValue({
      sessions: [
        { id: "d", status: "draft", ticketCount: 3 },
        { id: "p", status: "in_progress", ticketCount: 5 },
        { id: "c", status: "completed", ticketCount: 9 },
      ],
      isLoading: false,
    });
    expect(renderHook(() => useSidebarData()).result.current.refinement).toEqual({ count: 5, note: "to refine" });
  });

  it("uses the latest draft session when none are in progress", () => {
    mockUseRefinementSessions.mockReturnValue({
      sessions: [
        { id: "d2", status: "draft", ticketCount: 4 },
        { id: "d1", status: "draft", ticketCount: 2 },
      ],
      isLoading: false,
    });
    expect(renderHook(() => useSidebarData()).result.current.refinement.count).toBe(4);
  });

  it("refinement count is zero with no open sessions, null while loading", () => {
    expect(renderHook(() => useSidebarData()).result.current.refinement).toEqual({ count: 0, note: "to refine" });

    mockUseRefinementSessions.mockReturnValue({ sessions: [], isLoading: true });
    expect(renderHook(() => useSidebarData()).result.current.refinement.count).toBeNull();
  });
});
