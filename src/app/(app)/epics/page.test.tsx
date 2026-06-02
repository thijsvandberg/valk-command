import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";

const mockUseEpicProgress = vi.fn();
const mockUseEpicTickets = vi.fn();
vi.mock("@/hooks/useEpics", () => ({
  useEpicProgress: () => mockUseEpicProgress(),
  useEpicTickets: (key: string, enabled: boolean) => mockUseEpicTickets(key, enabled),
  useSetEpicTeams: () => vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({
    sprints: [
      { id: 12, name: "Sprint C", state: "active", startDate: "2026-01-29", endDate: "2026-02-11" },
      { id: 11, name: "Sprint B", state: "closed", startDate: "2026-01-15", endDate: "2026-01-28" },
    ],
  }),
}));

// ViewHeader portals to #view-header-portal which doesn't exist in jsdom; render inline.
vi.mock("@/components/shared/ViewHeader", () => ({
  ViewHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ViewHeaderTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

import EpicsPage from "./page";

function makeEpic(overrides: Partial<EpicProgressItem> = {}): EpicProgressItem {
  return {
    key: "VPL-E1",
    name: "Checkout Revamp",
    totalTickets: 4,
    completedTickets: 2,
    totalPoints: 10,
    completedPoints: 5,
    inProgressPoints: 2,
    todoPoints: 3,
    sprintIds: ["12"],
    perSprint: [{ sprintId: "12", total: 4, completed: 2 }],
    pointsBased: true,
    teams: [],
    status: "in_progress",
    ...overrides,
  };
}

describe("EpicsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseEpicTickets.mockReturnValue({ data: [], isLoading: false });
  });

  it("shows a skeleton while loading", () => {
    mockUseEpicProgress.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<EpicsPage />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders an epic row with its name, key and progress", () => {
    mockUseEpicProgress.mockReturnValue({ data: [makeEpic()], isLoading: false });
    render(<EpicsPage />);
    expect(screen.getByText("Checkout Revamp")).toBeInTheDocument();
    expect(screen.getByText("VPL-E1")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    // Collapsed by default: child tickets are not fetched.
    expect(mockUseEpicTickets).not.toHaveBeenCalled();
  });

  it("links the epic key to its detail page", () => {
    mockUseEpicProgress.mockReturnValue({ data: [makeEpic()], isLoading: false });
    render(<EpicsPage />);
    expect(screen.getByRole("link", { name: /VPL-E1/i })).toHaveAttribute("href", "/tickets/VPL-E1");
  });

  it("expands a row to load child tickets", () => {
    mockUseEpicProgress.mockReturnValue({ data: [makeEpic()], isLoading: false });
    render(<EpicsPage />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(mockUseEpicTickets).toHaveBeenCalledWith("VPL-E1", true);
  });

  it("shows an empty state when there are no epics", () => {
    mockUseEpicProgress.mockReturnValue({ data: [], isLoading: false });
    render(<EpicsPage />);
    expect(screen.getByText(/no epics with tickets/i)).toBeInTheDocument();
  });

  it("filters epics by team", () => {
    mockUseEpicProgress.mockReturnValue({
      data: [
        makeEpic({ key: "VPL-A", name: "Alpha", teams: ["BT"] }),
        makeEpic({ key: "VPL-B", name: "Beta", teams: ["GXP"] }),
      ],
      isLoading: false,
    });
    localStorage.setItem("bridge:epic-filters", JSON.stringify({ teams: ["BT"] }));
    render(<EpicsPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("filters epics by status, combined with team", () => {
    mockUseEpicProgress.mockReturnValue({
      data: [
        makeEpic({ key: "VPL-A", name: "Alpha", teams: ["BT"], status: "done" }),
        makeEpic({ key: "VPL-B", name: "Beta", teams: ["BT"], status: "open" }),
      ],
      isLoading: false,
    });
    localStorage.setItem("bridge:epic-filters", JSON.stringify({ teams: ["BT"], statuses: ["done"] }));
    render(<EpicsPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("shows a filtered-empty state distinct from the no-epics state", () => {
    mockUseEpicProgress.mockReturnValue({
      data: [makeEpic({ key: "VPL-A", name: "Alpha", teams: ["BT"] })],
      isLoading: false,
    });
    localStorage.setItem("bridge:epic-filters", JSON.stringify({ teams: ["HT"] }));
    render(<EpicsPage />);
    expect(screen.getByText(/no epics match the current filters/i)).toBeInTheDocument();
    expect(screen.queryByText(/no epics with tickets/i)).not.toBeInTheDocument();
  });
});
