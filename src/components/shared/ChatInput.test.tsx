import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatInput } from "./ChatInput";

describe("ChatInput", () => {
  it("renders textarea with placeholder", () => {
    render(<ChatInput onSend={async () => true} placeholder="Type here..." />);
    expect(screen.getByPlaceholderText("Type here...")).toBeInTheDocument();
  });

  it("renders send button", () => {
    render(<ChatInput onSend={async () => true} />);
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("sends on Enter key", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Hello");
    });
  });

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears input after successful send", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("restores input on failed send", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    render(<ChatInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Fail msg" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(textarea.value).toBe("Fail msg");
    });
  });

  it("does not send empty messages", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables when disabled prop is true", () => {
    render(<ChatInput onSend={async () => true} disabled />);
    expect(screen.getByLabelText("Message input")).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("renders header slot", () => {
    render(<ChatInput onSend={async () => true} headerSlot={<div data-testid="header">Header</div>} />);
    expect(screen.getByTestId("header")).toBeInTheDocument();
  });

  it("renders footer slots", () => {
    render(
      <ChatInput
        onSend={async () => true}
        footerLeftSlot={<span data-testid="left">Left</span>}
        footerRightSlot={<span data-testid="right">Right</span>}
      />
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  it("renders resize handle when resizable", () => {
    const { container } = render(<ChatInput onSend={async () => true} resizable />);
    expect(container.querySelector(".cursor-row-resize")).toBeInTheDocument();
  });

  it("does not render resize handle by default", () => {
    const { container } = render(<ChatInput onSend={async () => true} />);
    expect(container.querySelector(".cursor-row-resize")).not.toBeInTheDocument();
  });
});
