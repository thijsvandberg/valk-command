import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConversationList from "./ConversationList";
import type { Conversation } from "@/types/chat";

const mockConversations: Conversation[] = [
  { id: "conv-1", title: "First conversation", type: "chat", createdAt: "2026-03-28T09:15:00Z", relatedTicket: null },
  { id: "conv-2", title: "Second conversation", type: "chat", createdAt: "2026-03-27T16:30:00Z", relatedTicket: null },
];

const defaultProps = {
  conversations: mockConversations,
  activeId: null as string | null,
  loading: false,
  error: null as string | null,
  onSelect: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
};

describe("ConversationList", () => {
  it("renders the conversations heading", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByText("Conversations")).toBeInTheDocument();
  });

  it("renders all conversations", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });

  it("marks the active conversation as selected", () => {
    render(<ConversationList {...defaultProps} activeId="conv-1" />);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    render(<ConversationList {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Second conversation"));
    expect(onSelect).toHaveBeenCalledWith("conv-2");
  });

  it("opens type picker and calls onCreate with type when option clicked", () => {
    const onCreate = vi.fn();
    render(<ConversationList {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByLabelText("New conversation"));
    // Picker should show options
    fireEvent.click(screen.getByText("Chat"));
    expect(onCreate).toHaveBeenCalledWith("chat");
  });

  it("calls onCreate with investigation type", () => {
    const onCreate = vi.fn();
    render(<ConversationList {...defaultProps} onCreate={onCreate} />);
    fireEvent.click(screen.getByLabelText("New conversation"));
    fireEvent.click(screen.getByText("Investigation"));
    expect(onCreate).toHaveBeenCalledWith("investigation");
  });

  it("calls onDelete when the delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<ConversationList {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete First conversation"));
    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("renders a listbox with correct label", () => {
    render(<ConversationList {...defaultProps} />);
    expect(screen.getByRole("listbox", { name: "Conversation list" })).toBeInTheDocument();
  });

  it("shows loading state when loading with no conversations", () => {
    render(<ConversationList {...defaultProps} conversations={[]} loading={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no conversations exist", () => {
    render(<ConversationList {...defaultProps} conversations={[]} />);
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    render(<ConversationList {...defaultProps} error="Something went wrong" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
