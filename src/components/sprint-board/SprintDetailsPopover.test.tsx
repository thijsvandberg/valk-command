import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintDetailsPopover } from "./SprintDetailsPopover";
import type { Sprint } from "@/types/ticket";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "100",
    name: "BT: 137",
    dateRange: "5 May - 16 May",
    state: "active",
    ticketCount: 10,
    startDate: "2026-05-05T00:00:00.000Z",
    endDate: "2026-05-16T00:00:00.000Z",
    goal: "Deliver authentication module",
    ...overrides,
  };
}

describe("SprintDetailsPopover", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={false}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  describe("Test documentation action (BRDG-461)", () => {
    it("renders for sprint kind and fires onTestDocs after closing", () => {
      const onTestDocs = vi.fn();
      const onClose = vi.fn();
      render(
        <SprintDetailsPopover sprint={makeSprint()} open={true} onClose={onClose} onTestDocs={onTestDocs} />,
      );
      fireEvent.click(screen.getByText("Test documentation"));
      expect(onClose).toHaveBeenCalled();
      expect(onTestDocs).toHaveBeenCalledTimes(1);
    });

    it("is absent for epic groups and when no handler is supplied", () => {
      const { rerender } = render(
        <SprintDetailsPopover kind="epic" open={true} onClose={vi.fn()} onTestDocs={vi.fn()} canSync onRunSync={vi.fn()} />,
      );
      expect(screen.queryByText("Test documentation")).not.toBeInTheDocument();

      rerender(<SprintDetailsPopover sprint={makeSprint()} open={true} onClose={vi.fn()} onEdit={vi.fn()} />);
      expect(screen.queryByText("Test documentation")).not.toBeInTheDocument();
    });
  });

  it("shows the settings action and never renders the sprint goal text", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Sprint settings")).toBeInTheDocument();
    expect(screen.queryByText("Deliver authentication module")).not.toBeInTheDocument();
  });

  it("offers 'Suggest goal with AI' when no goal is set and suggestion is wired", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint({ goal: null })}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onSuggestGoal={vi.fn()}
      />,
    );

    expect(screen.getByText("Suggest goal with AI")).toBeInTheDocument();
  });

  it("offers no goal suggestion when a goal already exists", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onSuggestGoal={vi.fn()}
      />,
    );

    expect(screen.queryByText("Suggest goal with AI")).not.toBeInTheDocument();
  });

  it("calls onEdit and onClose when 'Sprint settings' is clicked", () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();

    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={onClose}
        onEdit={onEdit}
      />,
    );

    fireEvent.click(screen.getByText("Sprint settings"));
    expect(onClose).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalled();
  });

  it("shows 'Close sprint' for an active sprint and triggers the callback", () => {
    const onClose = vi.fn();
    const onCloseSprint = vi.fn();

    render(
      <SprintDetailsPopover
        sprint={makeSprint({ state: "active" })}
        open={true}
        onClose={onClose}
        onEdit={vi.fn()}
        onCloseSprint={onCloseSprint}
      />,
    );

    fireEvent.click(screen.getByText("Close sprint"));
    expect(onClose).toHaveBeenCalled();
    expect(onCloseSprint).toHaveBeenCalled();
  });

  it("shows 'Start sprint' for a future sprint and triggers the callback", () => {
    const onClose = vi.fn();
    const onStartSprint = vi.fn();

    render(
      <SprintDetailsPopover
        sprint={makeSprint({ state: "future" })}
        open={true}
        onClose={onClose}
        onEdit={vi.fn()}
        onStartSprint={onStartSprint}
      />,
    );

    fireEvent.click(screen.getByText("Start sprint"));
    expect(onClose).toHaveBeenCalled();
    expect(onStartSprint).toHaveBeenCalled();
  });

  it("hides 'Start sprint' when the sprint is not in the future", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint({ state: "active" })}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onStartSprint={vi.fn()}
      />,
    );

    expect(screen.queryByText("Start sprint")).not.toBeInTheDocument();
  });

  it("hides 'Close sprint' when the sprint is not active", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint({ state: "closed" })}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onCloseSprint={vi.fn()}
      />,
    );

    expect(screen.queryByText("Close sprint")).not.toBeInTheDocument();
  });

  it("shows an 'Open in Jira' link when a jiraUrl is provided", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        jiraUrl="https://new-story.atlassian.net/jira/software/projects/VPL/boards/233/backlog?jql=Sprint%20%3D%20100"
      />,
    );

    const link = screen.getByText("Open in Jira").closest("a");
    expect(link).toHaveAttribute("href", "https://new-story.atlassian.net/jira/software/projects/VPL/boards/233/backlog?jql=Sprint%20%3D%20100");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides 'Open in Jira' when no jiraUrl is provided", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByText("Open in Jira")).not.toBeInTheDocument();
  });

  describe("capacity meter toggle", () => {
    it("shows 'Show capacity meter' for an active sprint and triggers the callback", () => {
      const onToggleCapacityMeter = vi.fn();
      render(
        <SprintDetailsPopover
          sprint={makeSprint({ state: "active" })}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onToggleCapacityMeter={onToggleCapacityMeter}
        />,
      );

      fireEvent.click(screen.getByText("Show capacity meter"));
      expect(onToggleCapacityMeter).toHaveBeenCalledTimes(1);
    });

    it("reads 'Hide capacity meter' when the meter is currently shown", () => {
      render(
        <SprintDetailsPopover
          sprint={makeSprint({ state: "active" })}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onToggleCapacityMeter={vi.fn()}
          capacityMeterShown
        />,
      );

      expect(screen.getByText("Hide capacity meter")).toBeInTheDocument();
      expect(screen.queryByText("Show capacity meter")).not.toBeInTheDocument();
    });

    it("hides the capacity meter toggle for non-active sprints", () => {
      render(
        <SprintDetailsPopover
          sprint={makeSprint({ state: "future" })}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          onToggleCapacityMeter={vi.fn()}
        />,
      );

      expect(screen.queryByText("Show capacity meter")).not.toBeInTheDocument();
    });
  });

  describe("with sync action", () => {
    it("shows Sync and the sprint actions together in one flat menu", () => {
      render(
        <SprintDetailsPopover
          sprint={makeSprint()}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          canSync
          onRunSync={vi.fn()}
        />,
      );

      // No drill-in: sync and the settings action are both visible at once.
      expect(screen.getByText("Sync sprint")).toBeInTheDocument();
      expect(screen.getByText("Sprint settings")).toBeInTheDocument();
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
      expect(screen.queryByText("Back")).not.toBeInTheDocument();
    });

    it("calls onRunSync when the Sync action is clicked", () => {
      const onRunSync = vi.fn();
      render(
        <SprintDetailsPopover
          sprint={makeSprint()}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          canSync
          onRunSync={onRunSync}
        />,
      );

      fireEvent.click(screen.getByText("Sync sprint"));
      expect(onRunSync).toHaveBeenCalledTimes(1);
    });

    it("renders progress while running and the result when done", () => {
      const { rerender } = render(
        <SprintDetailsPopover
          sprint={makeSprint()}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          canSync
          onRunSync={vi.fn()}
          syncState="running"
          syncProgress={{ phase: "syncing", done: 25, total: 50 }}
        />,
      );
      expect(screen.getByText("Syncing 25 of 50")).toBeInTheDocument();

      rerender(
        <SprintDetailsPopover
          sprint={makeSprint()}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          canSync
          onRunSync={vi.fn()}
          syncState="done"
          syncResult={{ synced: 50, removed: 1 }}
        />,
      );
      expect(screen.getByText("Synced 50, 1 moved out")).toBeInTheDocument();
    });

    it("shows an error state", () => {
      render(
        <SprintDetailsPopover
          sprint={makeSprint()}
          open={true}
          onClose={vi.fn()}
          onEdit={vi.fn()}
          canSync
          onRunSync={vi.fn()}
          syncState="error"
        />,
      );
      expect(screen.getByText("Sync failed — retry")).toBeInTheDocument();
    });

    it("for an epic shows only the sync action and no sprint settings", () => {
      render(
        <SprintDetailsPopover
          kind="epic"
          open={true}
          onClose={vi.fn()}
          canSync
          onRunSync={vi.fn()}
        />,
      );

      expect(screen.getByText("Sync epic")).toBeInTheDocument();
      expect(screen.queryByText("Sprint settings")).not.toBeInTheDocument();
    });
  });
});
