import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
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
    // Default to having subtasks so the no-subtasks warning stays out of the
    // unrelated cases; tests that exercise it set totalSubtaskCount: 0.
    totalSubtaskCount: 1,
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

  it("warns about closed stories that still have open subtasks", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 1, totalSubtaskCount: 4 }),
      makeTicket({ key: "VPL-2", jiraStatus: "DEPRECATED", storyPoints: 2, openSubtaskCount: 2, totalSubtaskCount: 3 }),
      makeTicket({ key: "VPL-3", jiraStatus: "DONE", storyPoints: 5, openSubtaskCount: 0, totalSubtaskCount: 2 }),
    ];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.getByLabelText(/2 stories closed with open subtasks/)).toBeTruthy();
  });

  it("uses the singular form for one closed story with open subtasks", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 1, totalSubtaskCount: 4 }),
    ];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.getByLabelText(/1 story closed with open subtasks/)).toBeTruthy();
  });

  it("does not warn when closed stories have no open subtasks", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", jiraStatus: "DONE", storyPoints: 3, openSubtaskCount: 0, totalSubtaskCount: 3 }),
      makeTicket({ key: "VPL-2", jiraStatus: "IN PROGRESS", storyPoints: 2, openSubtaskCount: 2, totalSubtaskCount: 4 }),
    ];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.queryByLabelText(/closed with open subtasks/)).toBeNull();
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

  it("wraps the status pills in a container-query group so they hide when the bar is cramped", () => {
    render(<GroupStatBar tickets={TICKETS} />);
    // The four status pills live inside a wrapper that is `hidden` until the bar's
    // container query (@4xl) has room; below that width the whole breakdown drops.
    const wrapper = screen.getByText(/TO DO/).closest(".\\@4xl\\:contents");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.className).toContain("hidden");
    expect(wrapper).toContainElement(screen.getByText(/DONE/) as HTMLElement);
  });

  it("hides the status breakdown when every ticket shares the same status", () => {
    const allTodo = [
      makeTicket({ key: "VPL-1", jiraStatus: "TO DO", storyPoints: 3 }),
      makeTicket({ key: "VPL-2", jiraStatus: "TO DO", storyPoints: 5 }),
    ];
    render(<GroupStatBar tickets={allTodo} />);
    // The "TO DO: 2" pill would just echo "2 items", so it is suppressed.
    expect(screen.queryByText(/TO DO/)).toBeNull();
    expect(screen.getByText("2 items")).toBeTruthy();
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

    it("does not render the menu without a sprint or sync action", () => {
      render(<GroupStatBar tickets={TICKETS} label="BT: 138" />);
      expect(screen.queryByLabelText("Sprint options")).toBeNull();
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
      fireEvent.click(screen.getByLabelText("Sprint options"));
      fireEvent.click(screen.getByText("Sprint settings"));
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
      fireEvent.click(screen.getByLabelText("Sprint options"));
      fireEvent.click(screen.getByText("Close sprint"));
      expect(onCloseSprint).toHaveBeenCalledTimes(1);
    });

    it("exposes a Sync action and runs it when provided", () => {
      const onSync = vi.fn().mockResolvedValue({ synced: 0, removed: 0 });
      render(
        <GroupStatBar
          tickets={TICKETS}
          label="BT: 138"
          sprint={SPRINT}
          onEditSprintDetails={vi.fn()}
          onSync={onSync}
        />,
      );
      fireEvent.click(screen.getByLabelText("Sprint options"));
      fireEvent.click(screen.getByText("Sync sprint"));
      expect(onSync).toHaveBeenCalledTimes(1);
    });

    it("shows a header spinner with progress while a sync runs, persisting after the menu closes", async () => {
      let resolve!: (v: { synced: number; removed: number }) => void;
      let report!: (p: { phase: string; done: number; total: number }) => void;
      const onSync = vi.fn().mockImplementation((onProgress) => {
        report = onProgress;
        return new Promise((r) => { resolve = r; });
      });
      render(
        <GroupStatBar
          tickets={TICKETS}
          label="BT: 138"
          sprint={SPRINT}
          onEditSprintDetails={vi.fn()}
          onSync={onSync}
        />,
      );

      expect(screen.queryByRole("status")).toBeNull();
      fireEvent.click(screen.getByLabelText("Sprint options"));
      fireEvent.click(screen.getByText("Sync sprint"));
      // Spinner appears in the header bar...
      expect(screen.getByRole("status")).toBeInTheDocument();
      // ...with a progress-aware tooltip/label once tickets start syncing.
      await act(async () => { report({ phase: "syncing", done: 10, total: 22 }); });
      expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Synced 10 of 22 tickets");
      // ...and it stays even after the menu is dismissed.
      fireEvent.click(screen.getByLabelText("Sprint options"));
      expect(screen.getByRole("status")).toBeInTheDocument();

      await act(async () => {
        resolve({ synced: 22, removed: 0 });
      });
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    });

    it("renders an epic options menu with sync only", () => {
      const onSync = vi.fn().mockResolvedValue({ synced: 0, removed: 0 });
      render(
        <GroupStatBar tickets={TICKETS} label="My Epic" syncKind="epic" onSync={onSync} />,
      );
      fireEvent.click(screen.getByLabelText("Epic options"));
      expect(screen.getByText("Sync epic")).toBeInTheDocument();
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    });
  });

  it("renders label when provided", () => {
    render(<GroupStatBar tickets={TICKETS} label="Sprint Alpha" />);
    expect(screen.getByText("Sprint Alpha")).toBeTruthy();
  });

  describe("sprint goal tooltip", () => {
    const withGoal: Sprint = {
      id: "s1",
      name: "BT: 138",
      dateRange: "22 May - 4 Jun",
      state: "active",
      ticketCount: 2,
      startDate: "2026-05-22",
      endDate: "2026-06-04",
      goal: "Cut checkout drop-off",
    };

    it("shows the sprint goal in a tooltip when hovering the label", () => {
      vi.useFakeTimers();
      try {
        render(<GroupStatBar tickets={TICKETS} label="BT: 138" sprint={withGoal} />);
        expect(screen.queryByText("Cut checkout drop-off")).toBeNull();
        fireEvent.mouseEnter(screen.getByText("BT: 138"));
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.getByText("Sprint goal")).toBeInTheDocument();
        expect(screen.getByText("Cut checkout drop-off")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not wrap the label in a tooltip when the sprint has no goal", () => {
      vi.useFakeTimers();
      try {
        render(<GroupStatBar tickets={TICKETS} label="BT: 138" sprint={{ ...withGoal, goal: null }} />);
        fireEvent.mouseEnter(screen.getByText("BT: 138"));
        act(() => { vi.advanceTimersByTime(400); });
        expect(screen.queryByText("Sprint goal")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("renders chevron when onToggleCollapse is provided", () => {
    const { container } = render(
      <GroupStatBar tickets={TICKETS} onToggleCollapse={vi.fn()} isCollapsed={false} />,
    );
    // ChevronDown icon should be present (rendered as SVG)
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("surfaces tickets without subtasks via the warning icon for the active sprint", () => {
    const tickets = [
      makeTicket({ key: "VPL-1", storyPoints: 3, totalSubtaskCount: 2 }),
      makeTicket({ key: "VPL-2", storyPoints: 5, totalSubtaskCount: 0 }),
      makeTicket({ key: "VPL-3", storyPoints: 5, type: "bug", totalSubtaskCount: 0 }),
    ];
    render(<GroupStatBar tickets={tickets} isActive />);
    expect(screen.getByLabelText(/2 tickets without subtasks/)).toBeTruthy();
  });

  it("does not warn about missing subtasks for non-active sprints", () => {
    const tickets = [makeTicket({ key: "VPL-1", storyPoints: 3, totalSubtaskCount: 0 })];
    render(<GroupStatBar tickets={tickets} />);
    expect(screen.queryByLabelText(/without subtasks/)).toBeNull();
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
