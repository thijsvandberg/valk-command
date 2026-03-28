import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MessageDisplay from "./MessageDisplay";
import type { Message } from "@/data/chat-mock";

const mockMessages: Message[] = [
  {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "Hello, can you help me?",
    timestamp: "2026-03-28T09:10:00Z",
  },
  {
    id: "msg-2",
    conversationId: "conv-1",
    role: "assistant",
    content: "Of course! What do you need?",
    timestamp: "2026-03-28T09:12:00Z",
  },
];

describe("MessageDisplay", () => {
  it("renders the conversation title", () => {
    render(<MessageDisplay messages={mockMessages} conversationTitle="Test conversation" />);
    expect(screen.getByText("Test conversation")).toBeInTheDocument();
  });

  it("renders all messages", () => {
    render(<MessageDisplay messages={mockMessages} conversationTitle="Test conversation" />);
    expect(screen.getByText("Hello, can you help me?")).toBeInTheDocument();
    expect(screen.getByText("Of course! What do you need?")).toBeInTheDocument();
  });

  it("labels user messages with You", () => {
    render(<MessageDisplay messages={mockMessages} conversationTitle="Test conversation" />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("labels assistant messages with Assistant", () => {
    render(<MessageDisplay messages={mockMessages} conversationTitle="Test conversation" />);
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("renders a log region for accessibility", () => {
    render(<MessageDisplay messages={mockMessages} conversationTitle="Test conversation" />);
    expect(screen.getByRole("log", { name: "Chat messages" })).toBeInTheDocument();
  });
});
