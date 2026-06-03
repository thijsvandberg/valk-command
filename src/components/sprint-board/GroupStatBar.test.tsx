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

  it("renders the active-sprint dot only when isActive", () => {
    const { rerender } = render(<GroupStatBar tickets={TICKETS} label="BT: 138" />);
    expect(screen.queryByLabelText("Active sprint")).toBeNull();
    rerender(<GroupStatBar tickets={TICKETS} label="BT: 138" isActive />);
    expect(screen.getByLabelText("Active sprint")).toBeTruthy();
  });

  it("renders total story points", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    // 3 + 5 + 2 = 10, shown via the SP MetricBadge
    expect(screen.getByLabelText("Story Points: 10")).toBeTruthy();
  });

  it("surfaces unpointed tickets via the warning icon", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    // VPL-3 and VPL-5 have no points; collapsed into the warning icon's label.
    expect(screen.getByLabelText(/2 stories without a story point estimate/)).toBeTruthy();
  });

  it("filters unpointed when clicking the warning icon", () => {
    const onFilterChange = vi.fn();
    render(<GroupStatBar tickets={TICKETS} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByLabelText(/without a story point estimate/));
    expect(onFilterChange).toHaveBeenCalledWith("unpointed");
  });

  it("hides points total when all tickets are unpointed", () => {
    const noPointTickets = TICKETS.map((t) => ({ ...t, storyPoints: null }));
    render(<GroupStatBar tickets={noPointTickets} />);
    // The SP total badge should not appear; the unpointed warning icon still is
    expect(screen.queryByLabelText(/Story Points/)).toBeNull();
  });

  it("renders status pills for each non-zero status", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    expect(screen.getByText(/TO DO/)).toBeTruthy();
    expect(screen.getByText(/IN PROGRESS/)).toBeTruthy();
    expect(screen.getByText(/TEST/)).toBeTruthy();
    expect(screen.getByText(/DONE/)).toBeTruthy();
  });

  it("hides the per-status count pills when showStatusCounts is false", () => {
    render(<GroupStatBar tickets={TICKETS} showStatusCounts={false} />);
    expect(screen.queryByText(/TO DO/)).toBeNull();
    expect(screen.queryByText(/IN PROGRESS/)).toBeNull();
    expect(screen.queryByText(/TEST/)).toBeNull();
    expect(screen.queryByText(/DONE/)).toBeNull();
    // Item count and SP total remain.
    expect(screen.getByText("5 items")).toBeTruthy();
    expect(screen.getByLabelText("Story Points: 10")).toBeTruthy();
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

  it("calls onFilterChange with null when clicking the active warning icon", () => {
    const onFilterChange = vi.fn();
    render(
      <GroupStatBar
        tickets={TICKETS}
        activeCriterion="unpointed"
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/without a story point estimate/));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("hides the BV average when showBvAvg is false", () => {
    const bvTickets = [
      makeTicket({ key: "VPL-1", businessValue: 4, storyPoints: 3 }),
      makeTicket({ key: "VPL-2", businessValue: 2, storyPoints: 3 }),
    ];
    const { rerender } = render(<GroupStatBar tickets={bvTickets} />);
    expect(screen.getByText(/avg/)).toBeTruthy();
    rerender(<GroupStatBar tickets={bvTickets} showBvAvg={false} />);
    expect(screen.queryByText(/avg/)).toBeNull();
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

  it("excludes spikes from no-points count", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", storyPoints: 3 }),
      makeTicket({ key: "VPL-2", storyPoints: null }),
      makeTicket({ key: "VPL-3", storyPoints: null, type: "spike" }),
    ];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.getByLabelText(/1 story without a story point estimate/)).toBeTruthy();
  });

  it("does not render pills for zero-count statuses", () => {
    const onlyDone = [makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3 })];
    render(<GroupStatBar tickets={onlyDone} />);
    expect(screen.queryByText(/TO DO/)).toBeNull();
    expect(screen.queryByText(/IN PROGRESS/)).toBeNull();
    expect(screen.queryByText(/TEST/)).toBeNull();
  });

  describe("pin toggle", () => {
    it("does not render the pin button when onPin is not provided", () => {
      render(<GroupStatBar tickets={TICKETS} label="Sprint Alpha" />);
      expect(screen.queryByLabelText(/pin to sprint bar/i)).toBeNull();
      expect(screen.queryByLabelText(/unpin from sprint bar/i)).toBeNull();
    });

    it("renders a pin button and calls onPin when clicked", () => {
      const onPin = vi.fn();
      render(<GroupStatBar tickets={TICKETS} label="Sprint Alpha" onPin={onPin} />);
      fireEvent.click(screen.getByLabelText("Pin to sprint bar"));
      expect(onPin).toHaveBeenCalledTimes(1);
    });

    it("shows the unpin label when already pinned", () => {
      const onPin = vi.fn();
      render(<GroupStatBar tickets={TICKETS} label="Sprint Alpha" onPin={onPin} isPinned />);
      fireEvent.click(screen.getByLabelText("Unpin from sprint bar"));
      expect(onPin).toHaveBeenCalledTimes(1);
    });

    it("does not call onPin when pin is disabled and not yet pinned", () => {
      const onPin = vi.fn();
      render(
        <GroupStatBar tickets={TICKETS} label="Sprint Alpha" onPin={onPin} pinDisabled />,
      );
      fireEvent.click(screen.getByLabelText("Pin to sprint bar"));
      expect(onPin).not.toHaveBeenCalled();
    });

    it("still allows unpinning when pin is disabled but already pinned", () => {
      const onPin = vi.fn();
      render(
        <GroupStatBar
          tickets={TICKETS}
          label="Sprint Alpha"
          onPin={onPin}
          pinDisabled
          isPinned
        />,
      );
      fireEvent.click(screen.getByLabelText("Unpin from sprint bar"));
      expect(onPin).toHaveBeenCalledTimes(1);
    });

    it("stops click propagation so it does not toggle collapse", () => {
      const onPin = vi.fn();
      const onToggleCollapse = vi.fn();
      render(
        <div onClick={onToggleCollapse}>
          <GroupStatBar tickets={TICKETS} label="Sprint Alpha" onPin={onPin} />
        </div>,
      );
      fireEvent.click(screen.getByLabelText("Pin to sprint bar"));
      expect(onPin).toHaveBeenCalledTimes(1);
      expect(onToggleCollapse).not.toHaveBeenCalled();
    });
  });
});
