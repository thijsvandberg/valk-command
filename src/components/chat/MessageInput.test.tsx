import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MessageInput from "./MessageInput";

describe("MessageInput", () => {
  it("renders a textarea with placeholder", () => {
    render(<MessageInput onSend={() => {}} />);
    expect(screen.getByPlaceholderText("Send a message...")).toBeInTheDocument();
  });

  it("renders a send button", () => {
    render(<MessageInput onSend={() => {}} />);
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("calls onSend with the input value when send is clicked", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).toHaveBeenCalledWith("Hello world");
  });

  it("clears the input after sending", () => {
    render(<MessageInput onSend={() => {}} />);
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(textarea.value).toBe("");
  });

  it("does not send empty messages", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on Enter key press", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Enter test" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("Enter test");
  });

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Shift enter test" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input when disabled prop is true", () => {
    render(<MessageInput onSend={() => {}} disabled />);
    expect(screen.getByLabelText("Message input")).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });
});
