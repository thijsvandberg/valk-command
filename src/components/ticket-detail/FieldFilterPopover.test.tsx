import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FieldFilterPopover, type StatusFilter } from "./FieldFilterPopover";

const defaultProps = {
  filter: "all" as StatusFilter,
  setFilter: vi.fn(),
  statusCounts: { all: 5, "TO DO": 2, "IN PROGRESS": 1, DONE: 2 },
  fields: [
    { id: "issueKey", label: "issue keys" },
    { id: "assignee", label: "assignees" },
  ],
  visibleFields: new Set(["issueKey"]),
  onToggleField: vi.fn(),
  onClose: vi.fn(),
};

function renderPopover(overrides: Partial<typeof defaultProps> = {}) {
  return render(<FieldFilterPopover {...defaultProps} {...overrides} />);
}

describe("FieldFilterPopover", () => {
  it("renders status filter options with counts", () => {
    renderPopover();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides status options with zero count", () => {
    renderPopover({
      statusCounts: { all: 1, "TO DO": 1, "IN PROGRESS": 0, DONE: 0 },
    });
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("calls setFilter when clicking a status option", () => {
    const setFilter = vi.fn();
    renderPopover({ setFilter });
    fireEvent.click(screen.getByText("To Do"));
    expect(setFilter).toHaveBeenCalledWith("TO DO");
  });

  it("highlights active filter", () => {
    renderPopover({ filter: "TO DO" });
    const toDoLabel = screen.getByText("To Do");
    expect(toDoLabel.className).toContain("font-medium");
  });

  it("renders field toggles", () => {
    renderPopover();
    expect(screen.getByText("Hide issue keys")).toBeInTheDocument();
    expect(screen.getByText("Show assignees")).toBeInTheDocument();
  });

  it("calls onToggleField when clicking a field toggle", () => {
    const onToggleField = vi.fn();
    renderPopover({ onToggleField });
    fireEvent.click(screen.getByText("Hide issue keys"));
    expect(onToggleField).toHaveBeenCalledWith("issueKey", false);
  });

  it("shows 'Show' for hidden fields and 'Hide' for visible ones", () => {
    renderPopover({
      visibleFields: new Set(["issueKey"]),
    });
    expect(screen.getByText("Hide issue keys")).toBeInTheDocument();
    expect(screen.getByText("Show assignees")).toBeInTheDocument();
  });

  it("does not render divider when no fields", () => {
    const { container } = renderPopover({ fields: [] });
    const dividers = container.querySelectorAll(".bg-border-subtle");
    expect(dividers.length).toBe(0);
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
