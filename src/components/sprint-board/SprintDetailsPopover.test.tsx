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
});
