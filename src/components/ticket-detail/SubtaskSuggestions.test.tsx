import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SubtaskSuggestions } from "./SubtaskSuggestions";
import type { SubtaskSuggestionItem } from "./SubtaskSuggestions";

function item(title: string, id?: string): SubtaskSuggestionItem {
  return { id: id ?? `id-${title}`, title };
}

const defaultProps = {
  suggestions: [] as SubtaskSuggestionItem[],
  isLoading: false,
  progressText: null,
  error: null,
  addingIndices: new Set<number>(),
  isExpanded: false,
  onToggleExpanded: vi.fn(),
  onAdd: vi.fn(),
  onAddAll: vi.fn(),
  onDismiss: vi.fn(),
  onRegenerate: vi.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expandedProps(overrides: Record<string, any> = {}) {
  return { ...defaultProps, isExpanded: true, ...overrides };
}

describe("SubtaskSuggestions", () => {
  it("renders nothing when no suggestions, not loading, no error", () => {
    const { container } = render(<SubtaskSuggestions {...defaultProps} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows loading state with default text when expanded", () => {
    render(<SubtaskSuggestions {...expandedProps({ isLoading: true })} />);
    expect(screen.getByText("Generating subtask suggestions...")).toBeInTheDocument();
  });

  it("shows loading state with custom progress text when expanded", () => {
    render(<SubtaskSuggestions {...expandedProps({ isLoading: true, progressText: "Analyzing ticket..." })} />);
    expect(screen.getByText("Analyzing ticket...")).toBeInTheDocument();
  });

  it("shows error state when expanded", () => {
    render(<SubtaskSuggestions {...expandedProps({ error: "Connection to workspace lost" })} />);
    expect(screen.getByText("Connection to workspace lost")).toBeInTheDocument();
  });

  it("does not show suggestion titles when collapsed", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={[item("Set up database"), item("Create API endpoints")]}
      />,
    );
    expect(screen.queryByText("Set up database")).not.toBeInTheDocument();
    expect(screen.queryByText("Create API endpoints")).not.toBeInTheDocument();
  });

  it("renders suggestion titles when expanded", () => {
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Set up database"), item("Create API endpoints")] })}
      />,
    );
    expect(screen.getByText("Set up database")).toBeInTheDocument();
    expect(screen.getByText("Create API endpoints")).toBeInTheDocument();
  });

  it("calls onToggleExpanded when header is clicked", () => {
    const onToggleExpanded = vi.fn();
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={[item("Task A")]}
        onToggleExpanded={onToggleExpanded}
      />,
    );
    fireEvent.click(screen.getByText("AI Suggestions"));
    expect(onToggleExpanded).toHaveBeenCalled();
  });

  it("shows 'Add all' button when expanded with 2+ suggestions", () => {
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A"), item("Task B")] })}
      />,
    );
    expect(screen.getByText("Add all")).toBeInTheDocument();
  });

  it("hides 'Add all' button when collapsed", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={[item("Task A"), item("Task B")]}
      />,
    );
    expect(screen.queryByText("Add all")).not.toBeInTheDocument();
  });

  it("hides 'Add all' button for single suggestion even when expanded", () => {
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Only one")] })}
      />,
    );
    expect(screen.queryByText("Add all")).not.toBeInTheDocument();
  });

  it("shows 'Regenerate' button when expanded", () => {
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A")] })}
      />,
    );
    expect(screen.getByText("Regenerate")).toBeInTheDocument();
  });

  it("hides 'Regenerate' button when collapsed", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={[item("Task A")]}
      />,
    );
    expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
  });

  it("calls onRegenerate when 'Regenerate' is clicked", () => {
    const onRegenerate = vi.fn();
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A")], onRegenerate })}
      />,
    );
    fireEvent.click(screen.getByText("Regenerate"));
    expect(onRegenerate).toHaveBeenCalled();
  });

  it("calls onAdd with index when accept is clicked", () => {
    const onAdd = vi.fn();
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A"), item("Task B")], onAdd })}
      />,
    );

    const acceptButtons = screen.getAllByRole("button", { name: /Accept subtask/ });
    fireEvent.click(acceptButtons[1]);
    expect(onAdd).toHaveBeenCalledWith(1);
  });

  it("calls onDismiss with correct index when decline is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A"), item("Task B")], onDismiss })}
      />,
    );

    const declineButtons = screen.getAllByRole("button", { name: /Decline subtask/ });
    fireEvent.click(declineButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith(0);
  });

  it("calls onAddAll when 'Add all' is clicked", () => {
    const onAddAll = vi.fn();
    render(
      <SubtaskSuggestions
        {...expandedProps({ suggestions: [item("Task A"), item("Task B")], onAddAll })}
      />,
    );

    fireEvent.click(screen.getByText("Add all"));
    expect(onAddAll).toHaveBeenCalled();
  });

  it("shows spinner and disables actions for adding indices", () => {
    render(
      <SubtaskSuggestions
        {...expandedProps({
          suggestions: [item("Task A"), item("Task B")],
          addingIndices: new Set([0]),
        })}
      />,
    );

    const rows = screen.getAllByText(/Task [AB]/);
    const firstRow = rows[0].closest("[class*='group']") as HTMLElement;
    expect(within(firstRow).queryByRole("button", { name: /Accept subtask/ })).not.toBeInTheDocument();

    const secondRow = rows[1].closest("[class*='group']") as HTMLElement;
    expect(within(secondRow).getByRole("button", { name: /Accept subtask/ })).toBeInTheDocument();
  });

  it("shows suggestion count badge in header when collapsed", () => {
    render(
      <SubtaskSuggestions
        {...defaultProps}
        suggestions={[item("Task A"), item("Task B"), item("Task C")]}
      />,
    );
    const header = screen.getByText("AI Suggestions").closest("[role='button']") as HTMLElement;
    expect(within(header).getByText("3")).toBeInTheDocument();
  });

  describe("inline editing", () => {
    it("enters edit mode when edit button is clicked", () => {
      render(
        <SubtaskSuggestions
          {...expandedProps({ suggestions: [item("Task A")] })}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Edit subtask/ }));
      expect(screen.getByRole("textbox", { name: /Edit suggestion/ })).toHaveValue("Task A");
    });

    it("accepts with edited title on Enter", () => {
      const onAdd = vi.fn();
      render(
        <SubtaskSuggestions
          {...expandedProps({ suggestions: [item("Task A")], onAdd })}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Edit subtask/ }));
      const input = screen.getByRole("textbox", { name: /Edit suggestion/ });
      fireEvent.change(input, { target: { value: "Edited Task A" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onAdd).toHaveBeenCalledWith(0, "Edited Task A");
    });

    it("cancels editing on Escape", () => {
      render(
        <SubtaskSuggestions
          {...expandedProps({ suggestions: [item("Task A")] })}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Edit subtask/ }));
      const input = screen.getByRole("textbox", { name: /Edit suggestion/ });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("Task A")).toBeInTheDocument();
    });

    it("cancels editing when X is clicked during edit mode", () => {
      render(
        <SubtaskSuggestions
          {...expandedProps({ suggestions: [item("Task A")] })}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Edit subtask/ }));
      expect(screen.getByRole("textbox")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Cancel editing/ }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("confirms via accept button during edit mode", () => {
      const onAdd = vi.fn();
      render(
        <SubtaskSuggestions
          {...expandedProps({ suggestions: [item("Task A")], onAdd })}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Edit subtask/ }));
      const input = screen.getByRole("textbox", { name: /Edit suggestion/ });
      fireEvent.change(input, { target: { value: "Modified" } });
      fireEvent.click(screen.getByRole("button", { name: /Accept subtask/ }));

      expect(onAdd).toHaveBeenCalledWith(0, "Modified");
    });
  });
});
