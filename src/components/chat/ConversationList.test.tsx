import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConversationList from "./ConversationList";
import type { Conversation } from "@/types/chat";
import type { ConversationCategory } from "@/lib/conversation-category";

const mockConversations: Conversation[] = [
  { id: "conv-1", title: "First conversation", type: "chat", createdAt: "2026-03-28T09:15:00Z", relatedTicket: null, metadata: null },
  { id: "conv-2", title: "Second conversation", type: "chat", createdAt: "2026-03-27T16:30:00Z", relatedTicket: null, metadata: null },
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

  it("shows 'No matching conversations' when filters active and list is empty", () => {
    render(<ConversationList {...defaultProps} conversations={[]} hasActiveFilters={true} />);
    expect(screen.getByText("No matching conversations")).toBeInTheDocument();
  });

  it("shows error message when error is set", () => {
    render(<ConversationList {...defaultProps} error="Something went wrong" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders filter bar when filter props are provided", () => {
    const categoryCounts: Record<ConversationCategory, number> = {
      chat: 2, task: 0, investigation: 0, "story-writer": 0,
      "sprint-goal": 1, stakeholder: 0, review: 0,
    };
    render(
      <ConversationList
        {...defaultProps}
        categoryCounts={categoryCounts}
        activeFilters={new Set<ConversationCategory>()}
        onToggleFilter={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(screen.getByTestId("conversation-filter-bar")).toBeInTheDocument();
  });

  it("renders category-specific left border on conversation items", () => {
    const convs: Conversation[] = [
      { id: "sg-1", title: "Sprint Goal: BT: 137", type: "chat", createdAt: "2026-03-28T09:15:00Z", relatedTicket: null, metadata: null },
    ];
    render(<ConversationList {...defaultProps} conversations={convs} />);
    const button = screen.getByText("Sprint Goal: BT: 137").closest("button");
    expect(button?.style.borderLeft).toContain("2px solid");
  });
});
