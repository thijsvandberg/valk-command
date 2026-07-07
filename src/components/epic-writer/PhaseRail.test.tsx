import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PhaseRail } from "./PhaseRail";

// BRDG-491 #2: the phase rail is a compact prev / next + all-steps popover, not an
// inline 5-step row, so it scales on a narrow header.
describe("PhaseRail", () => {
  it("shows the current step name", () => {
    render(<PhaseRail current="breakdown" onSelect={vi.fn()} />);
    expect(screen.getByText("Breakdown")).toBeInTheDocument();
  });

  it("steps forward to the next phase", () => {
    const onSelect = vi.fn();
    render(<PhaseRail current="breakdown" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /next phase/i }));
    expect(onSelect).toHaveBeenCalledWith("refine");
  });

  it("steps back to the previous phase", () => {
    const onSelect = vi.fn();
    render(<PhaseRail current="breakdown" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /previous phase/i }));
    expect(onSelect).toHaveBeenCalledWith("discovery");
  });

  it("disables previous on the first phase", () => {
    render(<PhaseRail current="feed" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous phase/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next phase/i })).not.toBeDisabled();
  });

  it("disables next on the last phase", () => {
    render(<PhaseRail current="sprints" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /next phase/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous phase/i })).not.toBeDisabled();
  });

  it("jumps to any phase from the all-steps popover", () => {
    const onSelect = vi.fn();
    render(<PhaseRail current="feed" onSelect={onSelect} />);

    // Popover is closed by default.
    expect(screen.queryByRole("menuitem", { name: /Sprints/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /all phases/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sprints/ }));
    expect(onSelect).toHaveBeenCalledWith("sprints");
  });
});
