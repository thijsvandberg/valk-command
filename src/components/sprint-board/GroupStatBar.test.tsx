import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GroupStatBar } from "./GroupStatBar";
import type { Ticket } from "@/types/ticket";

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: "VPL-1",
    title: "Test",
    type: "story",
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    epic: null,
    epicKey: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    editState: "clean",
    notes: "",
    sprintId: "s1",
    businessValue: null,
    ...overrides,
  };
}

const TICKETS: Ticket[] = [
  makeTicket({ key: "VPL-1", jiraStatus: "TO DO", storyPoints: 3 }),
  makeTicket({ key: "VPL-2", jiraStatus: "IN PROGRESS", storyPoints: 5 }),
  makeTicket({ key: "VPL-3", jiraStatus: "TEST", storyPoints: null }),
  makeTicket({ key: "VPL-4", jiraStatus: "DONE", storyPoints: 2 }),
  makeTicket({ key: "VPL-5", jiraStatus: "TO DO", storyPoints: null }),
];

describe("GroupStatBar", () => {
  it("renders total item count", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    expect(screen.getByText("5 items")).toBeTruthy();
  });

  it("renders total story points", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    // 3 + 5 + 2 = 10 pts
    expect(screen.getByText("10 pts")).toBeTruthy();
  });

  it("renders no-points count for unpointed tickets", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    // VPL-3 and VPL-5 have no points
    expect(screen.getByText("2 no SP")).toBeTruthy();
  });

  it("hides points total when all tickets are unpointed", () => {
    const noPointTickets = TICKETS.map((t) => ({ ...t, storyPoints: null }));
    render(<GroupStatBar tickets={noPointTickets} />);
    // "X pts" (just the total) should not appear; "X no SP" is still shown
    expect(screen.queryByText(/^\d+ pts$/)).toBeNull();
  });

  it("renders status pills for each non-zero status", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    expect(screen.getByText(/TO DO/)).toBeTruthy();
    expect(screen.getByText(/IN PROGRESS/)).toBeTruthy();
    expect(screen.getByText(/TEST/)).toBeTruthy();
    expect(screen.getByText(/DONE/)).toBeTruthy();
  });

  it("calls onFilterChange with criterion when clicking an inactive pill", () => {
    const onFilterChange = vi.fn();
    render(<GroupStatBar tickets={TICKETS} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText(/DONE/));
    expect(onFilterChange).toHaveBeenCalledWith("done");
  });

  it("calls onFilterChange with null when clicking the active criterion", () => {
    const onFilterChange = vi.fn();
    render(
      <GroupStatBar
        tickets={TICKETS}
        activeCriterion="done"
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByText(/DONE/));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("calls onFilterChange with null when clicking active unpointed pill", () => {
    const onFilterChange = vi.fn();
    render(
      <GroupStatBar
        tickets={TICKETS}
        activeCriterion="unpointed"
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByText("2 no SP"));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("renders label when provided", () => {
    render(<GroupStatBar tickets={TICKETS} label="Sprint Alpha" />);
    expect(screen.getByText("Sprint Alpha")).toBeTruthy();
  });

  it("renders chevron when onToggleCollapse is provided", () => {
    const { container } = render(
      <GroupStatBar tickets={TICKETS} onToggleCollapse={vi.fn()} isCollapsed={false} />,
    );
    // ChevronDown icon should be present (rendered as SVG)
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("does not render pills for zero-count statuses", () => {
    const onlyDone = [makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3 })];
    render(<GroupStatBar tickets={onlyDone} />);
    expect(screen.queryByText(/TO DO/)).toBeNull();
    expect(screen.queryByText(/IN PROGRESS/)).toBeNull();
    expect(screen.queryByText(/TEST/)).toBeNull();
  });
});
