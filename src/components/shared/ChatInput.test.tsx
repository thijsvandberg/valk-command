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

  it("shows cancel button when disabled and onCancel is provided", () => {
    const onCancel = vi.fn();
    render(<ChatInput onSend={async () => true} disabled onCancel={onCancel} />);
    expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<ChatInput onSend={async () => true} disabled onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("cancel-button"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows send button when not disabled even if onCancel is provided", () => {
    render(<ChatInput onSend={async () => true} onCancel={() => {}} />);
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
  });

  describe("compact mode", () => {
    it("renders textarea and send button without a footer drag handle", () => {
      const { container } = render(<ChatInput onSend={async () => true} compact placeholder="Ask..." />);
      expect(screen.getByPlaceholderText("Ask...")).toBeInTheDocument();
      expect(screen.getByLabelText("Send message")).toBeInTheDocument();
      expect(container.querySelector(".cursor-row-resize")).not.toBeInTheDocument();
    });

    it("sends on Enter in compact mode", async () => {
      const onSend = vi.fn().mockResolvedValue(true);
      render(<ChatInput onSend={onSend} compact />);
      const textarea = screen.getByLabelText("Message input");
      fireEvent.change(textarea, { target: { value: "Hi" } });
      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
      await waitFor(() => {
        expect(onSend).toHaveBeenCalledWith("Hi");
      });
    });
  });
});
