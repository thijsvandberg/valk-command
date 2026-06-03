import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GroupStatBar } from "./GroupStatBar";
import type { Ticket, Sprint } from "@/types/ticket";

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

  it("surfaces unpointed tickets via the warning icon for the active sprint", () => {
    render(<GroupStatBar tickets={TICKETS} isActive />);
    // VPL-3 and VPL-5 have no points; collapsed into the warning icon's label.
    expect(screen.getByLabelText(/2 stories without a story point estimate/)).toBeTruthy();
  });

  it("does not warn about unpointed stories for non-active sprints", () => {
    // Future/backlog work is expected to be un-estimated, so no warning is shown.
    render(<GroupStatBar tickets={TICKETS} />);
    expect(screen.queryByLabelText(/without a story point estimate/)).toBeNull();
  });

  it("still warns about deprecated tickets with story points when not active", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DEPRECATED", storyPoints: 3 }),
      makeTicket({ key: "VPL-2", jiraStatus: "TO DO", storyPoints: null }),
    ];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.getByLabelText(/1 deprecated ticket still with story points/)).toBeTruthy();
    // The unpointed-story warning is suppressed (not the active sprint).
    expect(screen.queryByLabelText(/without a story point estimate/)).toBeNull();
  });

  it("makes the warning clickable for deprecated-with-points even when not active", () => {
    const onFilterChange = vi.fn();
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DEPRECATED", storyPoints: 3 }),
      makeTicket({ key: "VPL-2", jiraStatus: "TO DO", storyPoints: null }),
    ];
    render(<GroupStatBar tickets={tickets} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByLabelText(/deprecated ticket still with story points/));
    expect(onFilterChange).toHaveBeenCalledWith("unpointed");
  });

  it("filters unpointed when clicking the warning icon", () => {
    const onFilterChange = vi.fn();
    render(<GroupStatBar tickets={TICKETS} isActive onFilterChange={onFilterChange} />);
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
        isActive
        activeCriterion="unpointed"
        onFilterChange={onFilterChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/without a story point estimate/));
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });

  it("no longer renders the average inline (only on hover)", () => {
    const bvTickets = [
      makeTicket({ key: "VPL-1", businessValue: 4, storyPoints: 3 }),
      makeTicket({ key: "VPL-2", businessValue: 2, storyPoints: 3 }),
    ];
    render(<GroupStatBar tickets={bvTickets} />);
    // The standalone "avg N" pill is gone; the average now lives in the badge tooltip.
    expect(screen.queryByText(/avg/)).toBeNull();
  });

  it("surfaces the BV and SP averages in the badge tooltips on hover", () => {
    vi.useFakeTimers();
    try {
      const bvTickets = [
        makeTicket({ key: "VPL-1", businessValue: 4, storyPoints: 3 }),
        makeTicket({ key: "VPL-2", businessValue: 2, storyPoints: 5 }),
      ];
      render(<GroupStatBar tickets={bvTickets} />);
      // BV total 6 over 2 scored tickets -> avg 3.0 (split across two tidy rows)
      fireEvent.mouseEnter(screen.getByLabelText("Business Value: 6").parentElement!);
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.getByText("Business value: 6")).toBeInTheDocument();
      expect(screen.getByText("Average 3.0 per scored ticket")).toBeInTheDocument();
      fireEvent.mouseLeave(screen.getByLabelText("Business Value: 6").parentElement!);
      // SP total 8 over 2 estimated tickets -> avg 4.0
      fireEvent.mouseEnter(screen.getByLabelText("Story Points: 8").parentElement!);
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.getByText("Story points: 8")).toBeInTheDocument();
      expect(screen.getByText("Average 4.0 per estimated ticket")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits the average from the tooltip when showBvAvg is false", () => {
    vi.useFakeTimers();
    try {
      const bvTickets = [
        makeTicket({ key: "VPL-1", businessValue: 4, storyPoints: 3 }),
        makeTicket({ key: "VPL-2", businessValue: 2, storyPoints: 3 }),
      ];
      render(<GroupStatBar tickets={bvTickets} showBvAvg={false} />);
      fireEvent.mouseEnter(screen.getByLabelText("Business Value: 6").parentElement!);
      act(() => { vi.advanceTimersByTime(400); });
      expect(screen.queryByText(/avg/)).toBeNull();
      expect(screen.getByText("Business Value: 6")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("sprint menu", () => {
    const SPRINT: Sprint = {
      id: "s1",
      name: "BT: 138",
      dateRange: "22 May - 4 Jun",
      state: "active",
      ticketCount: 2,
      startDate: "2026-05-22",
      endDate: "2026-06-04",
      goal: "Ship the thing",
    };

    it("does not render the menu without a sprint", () => {
      render(<GroupStatBar tickets={TICKETS} label="BT: 138" />);
      expect(screen.queryByLabelText("Sprint goal and dates")).toBeNull();
    });

    it("opens the details popover and triggers edit", () => {
      const onEditSprintDetails = vi.fn();
      render(
        <GroupStatBar
          tickets={TICKETS}
          label="BT: 138"
          sprint={SPRINT}
          onEditSprintDetails={onEditSprintDetails}
        />,
      );
      fireEvent.click(screen.getByLabelText("Sprint goal and dates"));
      expect(screen.getByText("Ship the thing")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Edit details"));
      expect(onEditSprintDetails).toHaveBeenCalledTimes(1);
    });

    it("shows Close sprint only for active sprints with the callback", () => {
      const onCloseSprint = vi.fn();
      render(
        <GroupStatBar
          tickets={TICKETS}
          label="BT: 138"
          sprint={SPRINT}
          onEditSprintDetails={vi.fn()}
          onCloseSprint={onCloseSprint}
        />,
      );
      fireEvent.click(screen.getByLabelText("Sprint goal and dates"));
      fireEvent.click(screen.getByText("Close sprint"));
      expect(onCloseSprint).toHaveBeenCalledTimes(1);
    });
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
    render(<GroupStatBar tickets={tickets} isActive />);
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
