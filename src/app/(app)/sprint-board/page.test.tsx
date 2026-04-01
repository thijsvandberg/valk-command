import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SprintBoardPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useSprintSlots: () => ({ data: null }),
  useJiraSprints: () => ({
    data: [
      { id: 10048, name: "BT: 134", state: "active", startDate: "2026-03-31", endDate: "2026-04-09" },
      { id: 10050, name: "BT Sprint 135", state: "future", startDate: null, endDate: null },
    ],
  }),
  useTickets: () => ({
    data: [
      {
        key: "VPL-29223",
        title: "Monitoring Kibana dashboards",
        type: "task",
        epic: null,
        jiraStatus: "IN PROGRESS",
        storyPoints: 3,
        assignee: { name: "Jan de Vries", initials: "JV", color: "#4a90d9" },
        flagged: false,
        poStatus: null,
        qualityScore: null,
        qualityStale: false,
        notes: "",
      },
    ],
    isLoading: false,
    mutate: vi.fn(),
  }),
  useDebouncedCallback: (fn: () => void) => fn,
}));

describe("SprintBoardPage", () => {
  it("renders the sprint board with sprint slots", () => {
    render(<SprintBoardPage />);
    expect(screen.getAllByText("BT: 134").length).toBeGreaterThanOrEqual(1);
  });

  it("renders ticket table with API data", () => {
    render(<SprintBoardPage />);
    expect(screen.getByText("VPL-29223")).toBeInTheDocument();
    expect(screen.getByText(/Monitoring Kibana/)).toBeInTheDocument();
  });

  it("renders filter buttons", () => {
    render(<SprintBoardPage />);
    expect(screen.getAllByText("Status").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Epic").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the refresh button", () => {
    render(<SprintBoardPage />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });
});
