import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintAnalytics } from "./SprintAnalytics";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => ({
  ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron-right" {...props} />,
  BarChart2: (props: Record<string, unknown>) => <span data-testid="bar-chart" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="x-icon" {...props} />,
  Hash: (props: Record<string, unknown>) => <span data-testid="hash-icon" {...props} />,
  TrendingUp: (props: Record<string, unknown>) => <span data-testid="trending-up-icon" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <span data-testid="chevron-up" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="chevron-down" {...props} />,
}));

vi.mock("./BurnupChart", () => ({
  BurnupChart: () => <div data-testid="burnup-chart" />,
}));

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "PROJ-1",
    title: "Test ticket",
    type: "story",
    epicKey: null,
    flagged: false,
    jiraStatus: "TO DO",
    storyPoints: 3,
    businessValue: 5,
    assignee: { name: "Alice", initials: "A", color: "#abc" },
    epic: null,
    qualityScore: null,
    readiness: null,
    poStatus: null,
    editState: "clean",
    notes: "",
    ...overrides,
  };
}

describe("SprintAnalytics", () => {
  it("returns null when no points and no BV", () => {
    const { container } = render(
      <SprintAnalytics tickets={[makeTicket({ storyPoints: 0, businessValue: null })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Analytics label with total points", () => {
    render(<SprintAnalytics tickets={[makeTicket({ storyPoints: 5 }), makeTicket({ storyPoints: 3 })]} />);
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByLabelText("Story Points: 8")).toBeInTheDocument();
  });

  it("shows BV total when tickets have BV", () => {
    render(<SprintAnalytics tickets={[makeTicket({ businessValue: 4 }), makeTicket({ businessValue: 6 })]} />);
    expect(screen.getByLabelText("Business Value: 10")).toBeInTheDocument();
  });

  it("renders close button when onClose provided", () => {
    const onClose = vi.fn();
    render(<SprintAnalytics tickets={[makeTicket()]} onClose={onClose} />);
    expect(screen.getByTitle("Close analytics")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Close analytics"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("collapses and expands analytics section", () => {
    render(<SprintAnalytics tickets={[makeTicket()]} />);
    // Initially expanded -- look for "Story Points by status" heading
    expect(screen.getByText("Story Points by status")).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText("Analytics"));
    expect(screen.queryByText("Story Points by status")).not.toBeInTheDocument();

    // Click to expand again
    fireEvent.click(screen.getByText("Analytics"));
    expect(screen.getByText("Story Points by status")).toBeInTheDocument();
  });
});
