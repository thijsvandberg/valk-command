import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatBubble } from "./ChatBubble";

describe("ChatBubble", () => {
  it("renders user message right-aligned", () => {
    render(<ChatBubble role="user">Hello</ChatBubble>);
    const wrapper = screen.getByText("Hello").closest(".group\\/msg");
    expect(wrapper?.className).toContain("items-end");
  });

  it("renders assistant message left-aligned", () => {
    render(<ChatBubble role="assistant">Hi there</ChatBubble>);
    const wrapper = screen.getByText("Hi there").closest(".group\\/msg");
    expect(wrapper?.className).toContain("items-start");
  });

  it("applies dimmed class when dimmed is true", () => {
    render(<ChatBubble role="user" dimmed>Dimmed</ChatBubble>);
    expect(screen.getByTestId("message-user").className).toContain("opacity-60");
  });

  it("renders actions inside the bubble", () => {
    render(
      <ChatBubble role="assistant" actions={<button data-testid="action">Copy</button>}>
        Content
      </ChatBubble>
    );
    expect(screen.getByTestId("action")).toBeInTheDocument();
  });

  it("renders timestamp when provided", () => {
    render(
      <ChatBubble role="user" timestamp="2026-05-22T14:30:00Z" showTimestamp="always">
        Hello
      </ChatBubble>
    );
    // Timestamp renders in local timezone, just check it exists as a span
    const bubble = screen.getByTestId("message-user");
    const timestampEl = bubble.parentElement?.querySelector("span.tabular-nums");
    expect(timestampEl).toBeInTheDocument();
    expect(timestampEl?.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it("uses custom testId", () => {
    render(<ChatBubble role="user" testId="custom-msg">Hello</ChatBubble>);
    expect(screen.getByTestId("custom-msg")).toBeInTheDocument();
  });
});
