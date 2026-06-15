import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildIssueRow } from "./ChildIssueRow";
import type { Subtask } from "@/types/ticket";

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, showReadiness }: { ticketKey: string; showReadiness?: boolean }) => (
    <span data-testid="ticket-status-pill" data-show-readiness={String(showReadiness)}>{ticketKey}</span>
  ),
}));

const baseSub: Subtask = {
  key: "VPL-100",
  title: "Test subtask",
  type: "subtask",
  jiraStatus: "TO DO",
  assignee: null,
};

describe("ChildIssueRow", () => {
  it("renders item title", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(screen.getByText("Test subtask")).toBeInTheDocument();
  });

  it("renders TicketStatusPill when showKey is true (default)", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(screen.getByTestId("ticket-status-pill")).toHaveTextContent("VPL-100");
  });

  it("still renders pill when showKey is false (status-only mode)", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showKey={false} />);
    expect(screen.getByTestId("ticket-status-pill")).toBeInTheDocument();
  });

  it("hides pill entirely when type icon, key, and status are all off", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showKey={false} showStatus={false} />);
    expect(screen.queryByTestId("ticket-status-pill")).not.toBeInTheDocument();
  });

  it("still renders the pill for the type icon alone when key and status are off", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showTypeIcon showKey={false} showStatus={false} />);
    expect(screen.getByTestId("ticket-status-pill")).toBeInTheDocument();
  });

  it("forwards showReadiness=false to the pill so subtasks never show a readiness dot", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showReadiness={false} />);
    expect(screen.getByTestId("ticket-status-pill")).toHaveAttribute("data-show-readiness", "false");
  });

  it("shows spinner instead of pill when pending", () => {
    const pending = { ...baseSub, key: "pending-123" };
    render(<ChildIssueRow item={pending} isLast={false} isPending showKey />);
    expect(screen.queryByTestId("ticket-status-pill")).not.toBeInTheDocument();
  });

  it("calls onSelect when row is clicked", () => {
    const onSelect = vi.fn();
    render(<ChildIssueRow item={baseSub} isLast={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Test subtask"));
    expect(onSelect).toHaveBeenCalledWith("VPL-100", expect.anything());
  });

  it("does not call onSelect when pending", () => {
    const onSelect = vi.fn();
    const pending = { ...baseSub, key: "pending-123" };
    render(<ChildIssueRow item={pending} isLast={false} isPending onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Test subtask"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders metadata slot", () => {
    render(
      <ChildIssueRow
        item={baseSub}
        isLast={false}
        metadataSlot={<span data-testid="metadata">3 SP</span>}
      />,
    );
    expect(screen.getByTestId("metadata")).toHaveTextContent("3 SP");
  });

  it("renders actions slot when not pending and not editing", () => {
    render(
      <ChildIssueRow
        item={baseSub}
        isLast={false}
        actionsSlot={<button data-testid="delete-btn">Delete</button>}
      />,
    );
    expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
  });

  describe("assignee control vs. actions overlay (BRDG-318)", () => {
    it("renders both an interactive metadata control and the actions on the same row", () => {
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          metadataSlot={<button data-testid="assignee-trigger">A</button>}
          actionsSlot={<button data-testid="delete-btn">Delete</button>}
        />,
      );
      expect(screen.getByTestId("assignee-trigger")).toBeInTheDocument();
      expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
    });

    it("isolates metadata-control clicks from row select so the picker stays usable", () => {
      const onSelect = vi.fn();
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          onSelect={onSelect}
          metadataSlot={<button data-testid="assignee-trigger">A</button>}
        />,
      );
      fireEvent.click(screen.getByTestId("assignee-trigger"));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("lifts the metadata control above the actions overlay (z-20)", () => {
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          metadataSlot={<button data-testid="assignee-trigger">A</button>}
        />,
      );
      expect(screen.getByTestId("assignee-trigger").parentElement).toHaveClass("z-20");
    });

    it("keeps the fade anchored to the row edge while padding the actions clear of the metadata control", () => {
      const { rerender } = render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          metadataSlot={<button data-testid="assignee-trigger">A</button>}
          actionsSlot={<button data-testid="delete-btn">Delete</button>}
        />,
      );
      // Fade always runs to the edge; extra right padding clears the avatar.
      expect(screen.getByTestId("delete-btn").parentElement).toHaveClass("right-0");
      expect(screen.getByTestId("delete-btn").parentElement).toHaveClass("pr-11");

      rerender(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          actionsSlot={<button data-testid="delete-btn">Delete</button>}
        />,
      );
      expect(screen.getByTestId("delete-btn").parentElement).toHaveClass("right-0");
      expect(screen.getByTestId("delete-btn").parentElement).toHaveClass("pr-3");
    });
  });

  it("hides actions slot when pending", () => {
    const pending = { ...baseSub, key: "pending-123" };
    render(
      <ChildIssueRow
        item={pending}
        isLast={false}
        isPending
        actionsSlot={<button data-testid="delete-btn">Delete</button>}
      />,
    );
    expect(screen.queryByTestId("delete-btn")).not.toBeInTheDocument();
  });

  it("renders drag handle slot", () => {
    render(
      <ChildIssueRow
        item={baseSub}
        isLast={false}
        dragHandleSlot={<span data-testid="drag-handle">grip</span>}
      />,
    );
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("hides the drag handle during multiselect so it cannot fight the bulk gutter", () => {
    render(
      <ChildIssueRow
        item={baseSub}
        isLast={false}
        someChecked
        dragHandleSlot={<span data-testid="drag-handle">grip</span>}
      />,
    );
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
  });

  describe("multiselect checkbox", () => {
    it("renders a checkbox when selectable", () => {
      render(<ChildIssueRow item={baseSub} isLast={false} selectable />);
      expect(screen.getByRole("checkbox", { name: "Select VPL-100" })).toBeInTheDocument();
    });

    it("renders the checkbox in bulk mode (someChecked) too", () => {
      render(<ChildIssueRow item={baseSub} isLast={false} selectable someChecked />);
      expect(screen.getByRole("checkbox", { name: "Select VPL-100" })).toBeInTheDocument();
    });

    it("does not render a checkbox when not selectable", () => {
      render(<ChildIssueRow item={baseSub} isLast={false} />);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("does not render a checkbox on pending rows", () => {
      const pending = { ...baseSub, key: "pending-1" };
      render(<ChildIssueRow item={pending} isLast={false} isPending selectable />);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("reflects the checked state", () => {
      render(<ChildIssueRow item={baseSub} isLast={false} selectable isChecked />);
      expect(screen.getByRole("checkbox", { name: "Select VPL-100" })).toHaveAttribute("aria-checked", "true");
    });

    it("calls onCheckboxClick and not onSelect when the checkbox is clicked", () => {
      const onCheckboxClick = vi.fn();
      const onSelect = vi.fn();
      render(<ChildIssueRow item={baseSub} isLast={false} selectable onCheckboxClick={onCheckboxClick} onSelect={onSelect} />);
      fireEvent.click(screen.getByRole("checkbox", { name: "Select VPL-100" }));
      expect(onCheckboxClick).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("inline editing", () => {
    it("shows input when isEditing is true", () => {
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          isEditing
          editValue="Editing..."
          onEditChange={vi.fn()}
          onSaveEdit={vi.fn()}
          onCancelEdit={vi.fn()}
        />,
      );
      expect(screen.getByDisplayValue("Editing...")).toBeInTheDocument();
      expect(screen.queryByText("Test subtask")).not.toBeInTheDocument();
    });

    it("calls onSaveEdit on Enter", () => {
      const onSaveEdit = vi.fn();
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          isEditing
          editValue="New title"
          onEditChange={vi.fn()}
          onSaveEdit={onSaveEdit}
          onCancelEdit={vi.fn()}
        />,
      );
      fireEvent.keyDown(screen.getByDisplayValue("New title"), { key: "Enter" });
      expect(onSaveEdit).toHaveBeenCalled();
    });

    it("calls onCancelEdit on Escape", () => {
      const onCancelEdit = vi.fn();
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          isEditing
          editValue="New title"
          onEditChange={vi.fn()}
          onSaveEdit={vi.fn()}
          onCancelEdit={onCancelEdit}
        />,
      );
      fireEvent.keyDown(screen.getByDisplayValue("New title"), { key: "Escape" });
      expect(onCancelEdit).toHaveBeenCalled();
    });

    it("hides actions slot when editing", () => {
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          isEditing
          editValue="x"
          onEditChange={vi.fn()}
          onSaveEdit={vi.fn()}
          onCancelEdit={vi.fn()}
          actionsSlot={<button data-testid="delete-btn">Delete</button>}
        />,
      );
      expect(screen.queryByTestId("delete-btn")).not.toBeInTheDocument();
    });
  });

  describe("active (open-in-sidebar) state", () => {
    it("applies the active highlight when isActive", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} isActive />);
      expect(container.firstChild).toHaveClass("bg-[var(--color-brand-600)]/12");
      expect(container.firstChild).toHaveClass("shadow-[inset_3px_0_0_0_var(--color-brand-300)]");
    });

    it("applies the lighter checked highlight (not the active one) when only isChecked", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} isChecked />);
      expect(container.firstChild).toHaveClass("bg-[var(--color-brand-500)]/[0.06]");
      expect(container.firstChild).not.toHaveClass("bg-[var(--color-brand-600)]/12");
    });

    it("lets active win over checked when a row is both", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} isActive isChecked />);
      expect(container.firstChild).toHaveClass("bg-[var(--color-brand-600)]/12");
      expect(container.firstChild).not.toHaveClass("bg-[var(--color-brand-500)]/[0.06]");
    });

    it("has neither highlight when inactive and unchecked", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
      expect(container.firstChild).not.toHaveClass("bg-[var(--color-brand-600)]/12");
      expect(container.firstChild).not.toHaveClass("bg-[var(--color-brand-500)]/[0.06]");
    });

    it("drops the generic hover background on the active row so its tint stays stable", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} isActive onSelect={vi.fn()} />);
      expect(container.firstChild).not.toHaveClass("hover:bg-overlay-subtle");
      expect(container.firstChild).toHaveClass("cursor-pointer");
    });
  });

  it("renders line-less rows to match the sprint board (no inter-row border)", () => {
    const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(container.firstChild).not.toHaveClass("border-b");
  });

  describe("local-changes dot (BRDG-343 parity with sprint board)", () => {
    it("shows the local-changes dot when editState is local_edits", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} editState="local_edits" />);
      const dot = container.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();
      expect(dot?.className).toContain("color-icon-task");
    });

    it("shows the conflict dot when editState is conflict", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} editState="conflict" />);
      const dot = container.querySelector("span.rounded-full");
      expect(dot).toBeInTheDocument();
      expect(dot?.className).toContain("status-warning");
    });

    it("shows no edit-state dot when clean or unset", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} editState="clean" />);
      expect(container.querySelector("span.rounded-full")).not.toBeInTheDocument();
    });

    it("does not show the dot on pending rows", () => {
      const pending = { ...baseSub, key: "pending-1" };
      const { container } = render(<ChildIssueRow item={pending} isLast={false} isPending editState="local_edits" />);
      expect(container.querySelector("span.rounded-full")).not.toBeInTheDocument();
    });
  });

  it("fades deprecated rows with opacity-60 to match the sprint board", () => {
    const depr: Subtask = { ...baseSub, jiraStatus: "DEPRECATED" };
    const { container } = render(<ChildIssueRow item={depr} isLast={false} />);
    expect(container.firstChild).toHaveClass("opacity-60");
  });

  it("does not fade non-deprecated rows", () => {
    const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(container.firstChild).not.toHaveClass("opacity-60");
  });

  describe("flagged (sprint-board parity)", () => {
    it("tints the row and shows the inline flag when flagged", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} flagged />);
      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain("color-status-error");
      expect(container.querySelector("svg.lucide-flag")).toBeInTheDocument();
    });

    it("shows no flag tint or icon when not flagged", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
      const row = container.firstChild as HTMLElement;
      expect(row.className).not.toContain("color-status-error");
      expect(container.querySelector("svg.lucide-flag")).not.toBeInTheDocument();
    });

    it("active state takes visual precedence over flagged", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} flagged isActive />);
      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain("var(--color-brand-600)");
      expect(row.className).not.toContain("color-status-error");
    });
  });

  describe("active row highlight (open in sidebar)", () => {
    it("applies the active background and accent when isActive", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} isActive />);
      const row = container.firstChild as HTMLElement;
      expect(row.className).toContain("var(--color-brand-600)");
      expect(row.className).toContain("var(--color-brand-300)");
    });

    it("does not apply the active background by default", () => {
      const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
      const row = container.firstChild as HTMLElement;
      expect(row.className).not.toContain("var(--color-brand-600)");
    });
  });
});
