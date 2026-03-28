import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChatPage from "./page";

describe("ChatPage", () => {
  it("renders the page title", () => {
    render(<ChatPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Chat");
  });

  it("renders a description", () => {
    render(<ChatPage />);
    expect(screen.getByText(/primary interaction with the workspace/i)).toBeInTheDocument();
  });
});
