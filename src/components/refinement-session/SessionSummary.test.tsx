import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionSummary } from "./SessionSummary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockSessionState = {
  queue: ["VPL-1", "VPL-2", "VPL-3"],
  queueMeta: [],
  currentIndex: 2,
  activeSidebarPanel: null,
  sessionActive: false,
  sessionStartedAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago
  savedSessionId: null,
  startSession: vi.fn(),
  nextTicket: vi.fn(),
  prevTicket: vi.fn(),
  goToTicket: vi.fn(),
  toggleSidebarPanel: vi.fn(),
  reorderQueue: vi.fn(),
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

  it("shows ticket count", () => {
    render(<SessionSummary />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows duration", () => {
    render(<SessionSummary />);
    expect(screen.getByText("15 min")).toBeInTheDocument();
  });

  it("shows ticket keys", () => {
    render(<SessionSummary />);
    expect(screen.getByText("VPL-1")).toBeInTheDocument();
    expect(screen.getByText("VPL-2")).toBeInTheDocument();
    expect(screen.getByText("VPL-3")).toBeInTheDocument();
  });

  it("shows export button", () => {
    render(<SessionSummary />);
    expect(screen.getByText("Export as Markdown")).toBeInTheDocument();
  });

  it("shows back to refinement button", () => {
    render(<SessionSummary />);
    expect(screen.getByText("Back to Refinement")).toBeInTheDocument();
  });
});
