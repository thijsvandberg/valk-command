import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RefinementPage from "./page";

// Mock dependencies
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: (title: string) => {
    document.title = `${title} | Bridge`;
    return null;
  },
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({
    sprints: [
      { id: 1, name: "Sprint 10", state: "active", hidden: false, startDate: null, endDate: null, goal: null },
      { id: 2, name: "Sprint 11", state: "future", hidden: false, startDate: null, endDate: null, goal: null },
    ],
    backlogCount: 0,
  }),
  useSprintSlots: () => ({
    data: [
      { slotIndex: 0, sprintId: "1", sprintName: "Sprint 10" },
    ],
  }),
  useTickets: () => ({
    data: [
      {
        key: "VPL-100",
        title: "Test ticket one",
        type: "story",
        jiraStatus: "TO DO",
        storyPoints: null,
        assignee: null,
        flagged: false,
        readiness: "ready_to_refine",
        poStatus: null,
        qualityScore: null,
        businessValue: null,
        editState: "clean",
        notes: "",
        epic: null,
        epicKey: null,
        sprintId: "1",
        jiraUpdatedAt: new Date().toISOString(),
      },
      {
        key: "VPL-101",
        title: "Test ticket two",
        type: "task",
        jiraStatus: "IN PROGRESS",
        storyPoints: null,
        assignee: null,
        flagged: false,
        readiness: null,
        poStatus: null,
        qualityScore: null,
        businessValue: null,
        editState: "clean",
        notes: "",
        epic: null,
        epicKey: null,
        sprintId: "1",
        jiraUpdatedAt: new Date().toISOString(),
      },
      {
        key: "VPL-102",
        title: "Done ticket",
        type: "story",
        jiraStatus: "DONE",
        storyPoints: 5,
        assignee: null,
        flagged: false,
        readiness: null,
        poStatus: null,
        qualityScore: null,
        businessValue: null,
        editState: "clean",
        notes: "",
        epic: null,
        epicKey: null,
      },
    ],
  }),
}));

vi.mock("@/hooks/useRefinementSessions", () => ({
  useRefinementSessions: () => ({
    sessions: [
      {
        id: "test-session",
        name: "Test Session",
        ticketKeys: [],
        ticketCount: 0,
        status: "draft",
        createdAt: "2026-05-20T10:00:00Z",
        updatedAt: "2026-05-20T10:00:00Z",
      },
    ],
    mutate: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  }),
}));

vi.mock("@/contexts/RefinementSessionContext", () => ({
  useRefinementSession: () => ({
    startSession: vi.fn(),
    queue: [],
    currentIndex: 0,
    notesCollapsed: true,
    sessionActive: false,
    sessionStartedAt: null,
  }),
}));

// Mock ViewHeader to render children directly (avoids portal issues in tests)
vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="view-header">{children}</div>,
  ViewHeaderTitle: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

describe("RefinementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<RefinementPage />);
    expect(document.title).toContain("Refinement");
  });

  it("shows the select tickets heading", () => {
    render(<RefinementPage />);
    expect(screen.getByText("Select tickets")).toBeInTheDocument();
  });

  it("shows available non-DONE tickets", () => {
    render(<RefinementPage />);
    expect(screen.getByText("Test ticket one")).toBeInTheDocument();
    expect(screen.getByText("Test ticket two")).toBeInTheDocument();
    // DONE ticket should be filtered out
    expect(screen.queryByText("Done ticket")).not.toBeInTheDocument();
  });

  it("allows clicking tickets without error", () => {
    render(<RefinementPage />);
    const ticket1 = screen.getByText("Test ticket one");
    fireEvent.click(ticket1);
    // Ticket should still be visible after click
    expect(screen.getByText("Test ticket one")).toBeInTheDocument();
  });

  it("shows the queue panel with session name", () => {
    render(<RefinementPage />);
    const matches = screen.getAllByText("Test Session");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty queue message initially", () => {
    render(<RefinementPage />);
    expect(screen.getByText("Select tickets from the list")).toBeInTheDocument();
  });
});
