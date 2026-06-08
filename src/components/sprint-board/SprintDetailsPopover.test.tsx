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

  it("shows sprint goal when open", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint()}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Deliver authentication module")).toBeInTheDocument();
    expect(screen.getByText("Edit details")).toBeInTheDocument();
  });

  it("shows placeholder when no goal is set", () => {
    render(
      <SprintDetailsPopover
        sprint={makeSprint({ goal: null })}
        open={true}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("No sprint goal set")).toBeInTheDocument();
  });

  it("calls onEdit and onClose when edit button is clicked", () => {
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

    fireEvent.click(screen.getByText("Edit details"));
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

  describe("with sync action", () => {
    it("shows Sync and Settings at the top level, hiding settings until opened", () => {
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

      expect(screen.getByText("Sync sprint")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
      // Goal/Edit live behind Settings now.
      expect(screen.queryByText("Deliver authentication module")).not.toBeInTheDocument();
      expect(screen.queryByText("Edit details")).not.toBeInTheDocument();
    });

    it("drills into Settings and back", () => {
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

      fireEvent.click(screen.getByText("Settings"));
      expect(screen.getByText("Edit details")).toBeInTheDocument();
      fireEvent.click(screen.getByText("Back"));
      expect(screen.getByText("Sync sprint")).toBeInTheDocument();
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

    it("for an epic shows only the sync action and no settings", () => {
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
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    });
  });
});
