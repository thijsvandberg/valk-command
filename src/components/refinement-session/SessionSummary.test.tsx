import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionSummary } from "./SessionSummary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockSessionState = {
  queue: ["VPL-1", "VPL-2", "VPL-3"],
  currentIndex: 3,
  completionData: {
    "VPL-1": { pointsSet: true, subtasksAdded: 2, statusChanged: true },
    "VPL-2": { pointsSet: true, subtasksAdded: 1, statusChanged: false },
  },
  notesCollapsed: true,
  sessionActive: false,
  sessionStartedAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago
  startSession: vi.fn(),
  nextTicket: vi.fn(),
  prevTicket: vi.fn(),
  goToTicket: vi.fn(),
  markComplete: vi.fn(),
  toggleNotes: vi.fn(),
  endSession: vi.fn(),
};

vi.mock("@/contexts/RefinementSessionContext", () => ({
  useRefinementSession: () => mockSessionState,
}));

describe("SessionSummary", () => {
  it("renders session complete heading", () => {
    render(<SessionSummary />);
    expect(screen.getByText("Session Complete")).toBeInTheDocument();
  });

  it("shows correct ticket count", () => {
    render(<SessionSummary />);
    expect(screen.getByText("2/3")).toBeInTheDocument(); // 2 completed out of 3
  });

  it("shows estimated count", () => {
    render(<SessionSummary />);
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 estimated
  });

  it("shows total subtasks", () => {
    render(<SessionSummary />);
    expect(screen.getByText("3")).toBeInTheDocument(); // 2 + 1 subtasks
  });

  it("shows export button", () => {
    render(<SessionSummary />);
    expect(screen.getByText("Export as Markdown")).toBeInTheDocument();
  });

  it("shows back to refinement button", () => {
    render(<SessionSummary />);
    expect(screen.getByText("Back to Refinement")).toBeInTheDocument();
  });

  it("shows skipped ticket count", () => {
    render(<SessionSummary />);
    expect(screen.getByText(/1 ticket.* skipped/)).toBeInTheDocument();
  });
});
