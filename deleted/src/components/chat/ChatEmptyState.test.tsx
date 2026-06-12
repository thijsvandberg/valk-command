import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChatEmptyState from "./ChatEmptyState";

describe("ChatEmptyState", () => {
  it("renders the heading", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  it("renders a description", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText(/choose an existing conversation/i)).toBeInTheDocument();
  });

  it("has the empty state test id", () => {
    render(<ChatEmptyState />);
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
  });
});
