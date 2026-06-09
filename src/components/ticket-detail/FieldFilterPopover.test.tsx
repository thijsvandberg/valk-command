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

function renderPopover(overrides: Partial<React.ComponentProps<typeof FieldFilterPopover>> = {}) {
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

  it("renders Columns heading and field labels", () => {
    renderPopover();
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByText("Issue keys")).toBeInTheDocument();
    expect(screen.getByText("Assignees")).toBeInTheDocument();
  });

  it("calls onToggleField when clicking a field checkbox", () => {
    const onToggleField = vi.fn();
    renderPopover({ onToggleField });
    fireEvent.click(screen.getByText("Issue keys"));
    expect(onToggleField).toHaveBeenCalledWith("issueKey", false);
  });

  it("shows checked state for visible fields and unchecked for hidden", () => {
    renderPopover({ visibleFields: new Set(["issueKey"]) });
    // Visible field has a checked checkbox (subtle brand-tinted fill, per the shared Checkbox)
    const issueKeysBtn = screen.getByText("Issue keys").closest("button")!;
    const issueKeysCheckbox = issueKeysBtn.querySelector("span:first-child")!;
    expect(issueKeysCheckbox.className).toContain("bg-[var(--color-brand-500)]/20");
    // Hidden field has an unchecked checkbox (subtle neutral fill)
    const assigneesBtn = screen.getByText("Assignees").closest("button")!;
    const assigneesCheckbox = assigneesBtn.querySelector("span:first-child")!;
    expect(assigneesCheckbox.className).toContain("bg-overlay-subtle");
  });

  it("does not render Columns section when no fields", () => {
    renderPopover({ fields: [] });
    expect(screen.queryByText("Columns")).not.toBeInTheDocument();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the Hide deprecated toggle with count when deprecated items exist", () => {
    renderPopover({ hideDeprecated: true, onToggleHideDeprecated: vi.fn(), deprecatedCount: 3 });
    expect(screen.getByText("Hide deprecated")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not render the Hide deprecated toggle when there are no deprecated items", () => {
    renderPopover({ hideDeprecated: true, onToggleHideDeprecated: vi.fn(), deprecatedCount: 0 });
    expect(screen.queryByText("Hide deprecated")).not.toBeInTheDocument();
  });

  it("does not render the Hide deprecated toggle when no handler is provided", () => {
    renderPopover({ deprecatedCount: 3 });
    expect(screen.queryByText("Hide deprecated")).not.toBeInTheDocument();
  });

  it("calls onToggleHideDeprecated with the inverted value when clicked", () => {
    const onToggleHideDeprecated = vi.fn();
    renderPopover({ hideDeprecated: true, onToggleHideDeprecated, deprecatedCount: 2 });
    fireEvent.click(screen.getByText("Hide deprecated"));
    expect(onToggleHideDeprecated).toHaveBeenCalledWith(false);
  });
});
