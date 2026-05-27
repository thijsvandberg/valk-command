import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildIssueRow } from "./ChildIssueRow";
import type { Subtask } from "@/types/ticket";

vi.mock("@/components/shared/TicketKeyPill", () => ({
  TicketKeyPill: ({ ticketKey }: { ticketKey: string }) => (
    <button type="button" data-testid="ticket-key-pill">{ticketKey}</button>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: ({ type }: { type: string }) => (
    <span data-testid="issue-type-icon">{type}</span>
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

  it("renders TicketKeyPill when showKey is true", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showKey />);
    expect(screen.getByTestId("ticket-key-pill")).toHaveTextContent("VPL-100");
  });

  it("hides TicketKeyPill when showKey is false", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showKey={false} />);
    expect(screen.queryByTestId("ticket-key-pill")).not.toBeInTheDocument();
  });

  it("shows spinner instead of pill when pending", () => {
    const pending = { ...baseSub, key: "pending-123" };
    render(<ChildIssueRow item={pending} isLast={false} isPending showKey />);
    expect(screen.queryByTestId("ticket-key-pill")).not.toBeInTheDocument();
  });

  it("shows IssueTypeIcon when showTypeIcon is true", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showTypeIcon />);
    expect(screen.getByTestId("issue-type-icon")).toHaveTextContent("subtask");
  });

  it("hides IssueTypeIcon when showTypeIcon is false", () => {
    render(<ChildIssueRow item={baseSub} isLast={false} showTypeIcon={false} />);
    expect(screen.queryByTestId("issue-type-icon")).not.toBeInTheDocument();
  });

  it("calls onSelect when row is clicked", () => {
    const onSelect = vi.fn();
    render(<ChildIssueRow item={baseSub} isLast={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Test subtask"));
    expect(onSelect).toHaveBeenCalledWith("VPL-100");
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

    it("calls onStartEdit when title span is clicked", () => {
      const onStartEdit = vi.fn();
      render(
        <ChildIssueRow
          item={baseSub}
          isLast={false}
          onStartEdit={onStartEdit}
        />,
      );
      fireEvent.click(screen.getByText("Test subtask"));
      expect(onStartEdit).toHaveBeenCalled();
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

  it("applies border-b when not isLast", () => {
    const { container } = render(<ChildIssueRow item={baseSub} isLast={false} />);
    expect(container.firstChild).toHaveClass("border-b");
  });

  it("does not apply border-b when isLast", () => {
    const { container } = render(<ChildIssueRow item={baseSub} isLast />);
    expect(container.firstChild).not.toHaveClass("border-b");
  });
});
