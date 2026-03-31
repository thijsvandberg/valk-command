import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SprintBoardPage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("SprintBoardPage", () => {
  it("renders the sprint board with sprint slots", () => {
    render(<SprintBoardPage />);
    expect(screen.getAllByText("BT: 134").length).toBeGreaterThanOrEqual(1);
  });

  it("renders ticket table with mock data", () => {
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
