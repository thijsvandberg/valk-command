import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildIssueRow } from "./ChildIssueRow";
import type { Subtask } from "@/types/ticket";

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="ticket-status-pill">{ticketKey}</span>
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

  it("hides pill entirely when both showKey and showStatus are false", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showKey={false} showStatus={false} />);
    expect(screen.queryByTestId("ticket-status-pill")).not.toBeInTheDocument();
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

  it("renders line-less rows to match the sprint board (no inter-row border)", () => {
    const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(container.firstChild).not.toHaveClass("border-b");
  });
});
