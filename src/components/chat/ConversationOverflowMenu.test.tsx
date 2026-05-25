import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConversationOverflowMenu from "./ConversationOverflowMenu";

const baseProps = {
  conversationId: "conv-1",
  conversationTitle: "Test conversation",
  pinned: false,
  isUnread: false,
  onDelete: vi.fn(),
};

describe("ConversationOverflowMenu", () => {
  it("renders the trigger button", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    expect(screen.getByTestId("conversation-overflow-trigger")).toBeInTheDocument();
  });

  it("opens menu on click", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByTestId("conversation-overflow-menu")).toBeInTheDocument();
  });

  it("closes menu on second click", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    const trigger = screen.getByTestId("conversation-overflow-trigger");
    fireEvent.click(trigger);
    expect(screen.getByTestId("conversation-overflow-menu")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByTestId("conversation-overflow-menu")).not.toBeInTheDocument();
  });

  it("always shows Delete option", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByText("Delete conversation")).toBeInTheDocument();
  });

  it("calls onDelete and closes menu", () => {
    const onDelete = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    fireEvent.click(screen.getByTestId("overflow-delete"));
    expect(onDelete).toHaveBeenCalledWith("conv-1");
    expect(screen.queryByTestId("conversation-overflow-menu")).not.toBeInTheDocument();
  });

  it("shows Pin option when onTogglePin is provided", () => {
    const onTogglePin = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByText("Pin conversation")).toBeInTheDocument();
  });

  it("shows Unpin for pinned conversations", () => {
    const onTogglePin = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} pinned={true} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByText("Unpin conversation")).toBeInTheDocument();
  });

  it("calls onTogglePin with correct args", () => {
    const onTogglePin = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    fireEvent.click(screen.getByTestId("overflow-pin"));
    expect(onTogglePin).toHaveBeenCalledWith("conv-1", true);
  });

  it("calls onTogglePin with false for pinned conversation", () => {
    const onTogglePin = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} pinned={true} onTogglePin={onTogglePin} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    fireEvent.click(screen.getByTestId("overflow-pin"));
    expect(onTogglePin).toHaveBeenCalledWith("conv-1", false);
  });

  it("shows Mark as read for unread conversations", () => {
    const onToggleRead = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} isUnread={true} onToggleRead={onToggleRead} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByText("Mark as read")).toBeInTheDocument();
  });

  it("shows Mark as unread for read conversations", () => {
    const onToggleRead = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} isUnread={false} onToggleRead={onToggleRead} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByText("Mark as unread")).toBeInTheDocument();
  });

  it("calls onToggleRead with correct args", () => {
    const onToggleRead = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} isUnread={true} onToggleRead={onToggleRead} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    fireEvent.click(screen.getByTestId("overflow-toggle-read"));
    expect(onToggleRead).toHaveBeenCalledWith("conv-1", true);
  });

  it("hides Pin option when onTogglePin is not provided", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.queryByText("Pin conversation")).not.toBeInTheDocument();
  });

  it("hides read toggle when onToggleRead is not provided", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.queryByText("Mark as read")).not.toBeInTheDocument();
    expect(screen.queryByText("Mark as unread")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when menu opens/closes", () => {
    const onOpenChange = vi.fn();
    render(<ConversationOverflowMenu {...baseProps} onOpenChange={onOpenChange} />);
    const trigger = screen.getByTestId("conversation-overflow-trigger");
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses role=menu on the dropdown", () => {
    render(<ConversationOverflowMenu {...baseProps} onTogglePin={vi.fn()} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("uses role=menuitem on items", () => {
    render(<ConversationOverflowMenu {...baseProps} onTogglePin={vi.fn()} onToggleRead={vi.fn()} />);
    fireEvent.click(screen.getByTestId("conversation-overflow-trigger"));
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(3);
  });

  it("has accessible label on trigger", () => {
    render(<ConversationOverflowMenu {...baseProps} />);
    expect(screen.getByLabelText("Actions for Test conversation")).toBeInTheDocument();
  });
});
