import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ConversationList from "./ConversationList";
import type { Conversation } from "@/data/chat-mock";

const mockConversations: Conversation[] = [
  { id: "conv-1", title: "First conversation", lastMessageAt: "2026-03-28T09:15:00Z" },
  { id: "conv-2", title: "Second conversation", lastMessageAt: "2026-03-27T16:30:00Z" },
];

describe("ConversationList", () => {
  it("renders the conversations heading", () => {
    render(
      <ConversationList
        conversations={mockConversations}
        activeId={null}
        onSelect={() => {}}
        onNewConversation={() => {}}
      />
    );
    expect(screen.getByText("Conversations")).toBeInTheDocument();
  });

  it("renders all conversations", () => {
    render(
      <ConversationList
        conversations={mockConversations}
        activeId={null}
        onSelect={() => {}}
        onNewConversation={() => {}}
      />
    );
    expect(screen.getByText("First conversation")).toBeInTheDocument();
    expect(screen.getByText("Second conversation")).toBeInTheDocument();
  });

  it("marks the active conversation as selected", () => {
    render(
      <ConversationList
        conversations={mockConversations}
        activeId="conv-1"
        onSelect={() => {}}
        onNewConversation={() => {}}
      />
    );
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ConversationList
        conversations={mockConversations}
        activeId={null}
        onSelect={onSelect}
        onNewConversation={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Second conversation"));
    expect(onSelect).toHaveBeenCalledWith("conv-2");
  });

  it("calls onNewConversation when the new button is clicked", () => {
    const onNew = vi.fn();
    render(
      <ConversationList
        conversations={mockConversations}
        activeId={null}
        onSelect={() => {}}
        onNewConversation={onNew}
      />
    );
    fireEvent.click(screen.getByLabelText("New conversation"));
    expect(onNew).toHaveBeenCalled();
  });

  it("renders a listbox with correct label", () => {
    render(
      <ConversationList
        conversations={mockConversations}
        activeId={null}
        onSelect={() => {}}
        onNewConversation={() => {}}
      />
    );
    expect(screen.getByRole("listbox", { name: "Conversation list" })).toBeInTheDocument();
  });
});
