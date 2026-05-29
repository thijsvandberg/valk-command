import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusFilterChips } from "./StatusFilterChips";

const STATUSES = [
  { status: "TO DO", count: 3 },
  { status: "IN PROGRESS", count: 2 },
  { status: "DONE", count: 1 },
];

describe("StatusFilterChips", () => {
  it("renders all chips plus an All button", () => {
    render(
      <StatusFilterChips
        statuses={STATUSES}
        activeStatuses={new Set()}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText(/TO DO/)).toBeInTheDocument();
    expect(screen.getByText(/IN PROGRESS/)).toBeInTheDocument();
    expect(screen.getByText(/DONE/)).toBeInTheDocument();
  });

  it("calls onToggle when a status chip is clicked", () => {
    const onToggle = vi.fn();
    render(
      <StatusFilterChips
        statuses={STATUSES}
        activeStatuses={new Set()}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );
    fireEvent.mouseDown(screen.getByText(/TO DO/));
    expect(onToggle).toHaveBeenCalledWith("TO DO");
  });

  it("calls onClear when All is clicked", () => {
    const onClear = vi.fn();
    render(
      <StatusFilterChips
        statuses={STATUSES}
        activeStatuses={new Set(["TO DO"])}
        onToggle={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.mouseDown(screen.getByText("All"));
    expect(onClear).toHaveBeenCalled();
  });

  it("returns null when only one or no statuses", () => {
    const { container } = render(
      <StatusFilterChips
        statuses={[{ status: "TO DO", count: 5 }]}
        activeStatuses={new Set()}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(container.children).toHaveLength(0);
  });
});
