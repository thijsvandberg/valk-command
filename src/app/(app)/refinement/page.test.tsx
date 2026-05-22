import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RefinementPage from "./page";

// Mock dependencies
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: (title: string) => {
    document.title = `${title} | Bridge`;
    return null;
  },
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({
    data: [
      { id: 1, name: "Sprint 10", state: "active", hidden: false, startDate: null, endDate: null, goal: null },
      { id: 2, name: "Sprint 11", state: "future", hidden: false, startDate: null, endDate: null, goal: null },
    ],
  }),
  useTickets: () => ({
    data: [
      {
        key: "VPL-100",
        title: "Test ticket one",
        type: "story",
        jiraStatus: "TO DO",
        storyPoints: 3,
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

vi.mock("@/contexts/RefinementSessionContext", () => ({
  useRefinementSession: () => ({
    startSession: vi.fn(),
    queue: [],
    currentIndex: 0,
    completionData: {},
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

  it("allows selecting tickets to build a queue", () => {
    render(<RefinementPage />);
    const ticket1 = screen.getByText("Test ticket one");
    fireEvent.click(ticket1);
    // Queue should show "1 ticket"
    expect(screen.getByText(/1 ticket/)).toBeInTheDocument();
  });

  it("shows the queue panel", () => {
    render(<RefinementPage />);
    expect(screen.getByText("Queue")).toBeInTheDocument();
  });

  it("shows empty queue message initially", () => {
    render(<RefinementPage />);
    expect(screen.getByText("Select tickets from the list")).toBeInTheDocument();
  });
});
