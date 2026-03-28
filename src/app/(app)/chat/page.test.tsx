import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChatPage from "./page";

describe("ChatPage", () => {
  it("renders the empty state by default", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  it("renders the conversation sidebar", () => {
    render(<ChatPage />);
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("shows messages when a conversation is selected", () => {
    render(<ChatPage />);
    fireEvent.click(screen.getByText("Sprint 14 planning prep"));
    expect(screen.getByTestId("message-display")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-empty-state")).not.toBeInTheDocument();
  });

  it("shows the message input when a conversation is active", () => {
    render(<ChatPage />);
    fireEvent.click(screen.getByText("Sprint 14 planning prep"));
    expect(screen.getByTestId("message-input")).toBeInTheDocument();
  });

  it("returns to empty state when new conversation is clicked", () => {
    render(<ChatPage />);
    fireEvent.click(screen.getByText("Sprint 14 planning prep"));
    expect(screen.queryByTestId("chat-empty-state")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("New conversation"));
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
  });

  it("renders all mock conversations in the sidebar", () => {
    render(<ChatPage />);
    expect(screen.getByText("Sprint 14 planning prep")).toBeInTheDocument();
    expect(screen.getByText("Investigate auth token refresh")).toBeInTheDocument();
    expect(screen.getByText("Review VC-042 story quality")).toBeInTheDocument();
    expect(screen.getByText("Generate morning brief")).toBeInTheDocument();
  });

  it("renders the mobile sidebar toggle button", () => {
    render(<ChatPage />);
    expect(screen.getByLabelText("Open conversations")).toBeInTheDocument();
  });
});
