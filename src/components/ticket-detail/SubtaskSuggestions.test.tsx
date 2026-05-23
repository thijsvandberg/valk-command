import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SubtaskSuggestions } from "./SubtaskSuggestions";

const defaultProps = {
  suggestions: [] as string[],
  isLoading: false,
  progressText: null,
  error: null,
  addingIndices: new Set<number>(),
  onAdd: vi.fn(),
  onAddAll: vi.fn(),
  onDismiss: vi.fn(),
};

describe("SubtaskSuggestions", () => {
  it("renders nothing when no suggestions, not loading, no error", () => {
    const { container } = render(<SubtaskSuggestions {...defaultProps} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state with default text", () => {
    render(<SubtaskSuggestions {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Generating subtask suggestions...")).toBeInTheDocument();
  });

  it("shows loading state with custom progress text", () => {
    render(
      <SubtaskSuggestions {...defaultProps} isLoading={true} progressText="Analyzing ticket..." />,
    );
    expect(screen.getByText("Analyzing ticket...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SubtaskSuggestions {...defaultProps} error="Connection to workspace lost" />);
    expect(screen.getByText("Connection to workspace lost")).toBeInTheDocument();
  });

  it("renders suggestion titles", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Set up database", "Create API endpoints"]}
      />,
    );
    expect(screen.getByText("Set up database")).toBeInTheDocument();
    expect(screen.getByText("Create API endpoints")).toBeInTheDocument();
  });

  it("shows 'Add all' button when 2+ suggestions", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Task A", "Task B"]}
      />,
    );
    expect(screen.getByText("Add all")).toBeInTheDocument();
  });

  it("hides 'Add all' button for single suggestion", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Only one"]}
      />,
    );
    expect(screen.queryByText("Add all")).not.toBeInTheDocument();
  });

  it("calls onAdd with correct index", () => {
    const onAdd = vi.fn();
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Task A", "Task B"]}
        onAdd={onAdd}
      />,
    );

    const addButtons = screen.getAllByRole("button", { name: /Add subtask/ });
    fireEvent.click(addButtons[1]);
    expect(onAdd).toHaveBeenCalledWith(1);
  });

  it("calls onDismiss with correct index", () => {
    const onDismiss = vi.fn();
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Task A", "Task B"]}
        onDismiss={onDismiss}
      />,
    );

    const dismissButtons = screen.getAllByRole("button", { name: /Dismiss suggestion/ });
    fireEvent.click(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith(0);
  });

  it("calls onAddAll when 'Add all' is clicked", () => {
    const onAddAll = vi.fn();
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Task A", "Task B"]}
        onAddAll={onAddAll}
      />,
    );

    fireEvent.click(screen.getByText("Add all"));
    expect(onAddAll).toHaveBeenCalled();
  });

  it("shows spinner and disables actions for adding indices", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={["Task A", "Task B"]}
        addingIndices={new Set([0])}
      />,
    );

    // First row should not have Add/Dismiss buttons (it's adding)
    const rows = screen.getAllByText(/Task [AB]/);
    const firstRow = rows[0].closest("[class*='group']")!;
    expect(within(firstRow).queryByRole("button", { name: /Add subtask/ })).not.toBeInTheDocument();

    // Second row should still have buttons
    const secondRow = rows[1].closest("[class*='group']")!;
    expect(within(secondRow).getByRole("button", { name: /Add subtask/ })).toBeInTheDocument();
  });
});
