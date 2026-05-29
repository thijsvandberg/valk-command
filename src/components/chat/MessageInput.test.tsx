import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MessageInput from "./MessageInput";

function renderInput(props: Partial<React.ComponentProps<typeof MessageInput>> = {}) {
  const defaults: React.ComponentProps<typeof MessageInput> = {
    onSend: async () => true,
    model: "claude-sonnet-4-6",
    onModelChange: () => {},
    codebaseResearch: false,
    onCodebaseResearchChange: () => {},
  };
  return render(<MessageInput {...defaults} {...props} />);
}

describe("MessageInput", () => {
  it("renders a textarea with placeholder", () => {
    renderInput();
    expect(screen.getByPlaceholderText("Send a message...")).toBeInTheDocument();
  });

  it("renders a send button", () => {
    renderInput();
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("calls onSend with the input value when send is clicked", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderInput({ onSend });
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Hello world");
    });
  });

  it("clears the input after sending", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderInput({ onSend });
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello world" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("restores input value when send fails", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    renderInput({ onSend });
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Failed message" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => {
      expect(textarea.value).toBe("Failed message");
    });
  });

  it("does not send empty messages", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderInput({ onSend });
    fireEvent.click(screen.getByLabelText("Send message"));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on Enter key press", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderInput({ onSend });
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Enter test" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(onSend).toHaveBeenCalledWith("Enter test");
    });
  });

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    renderInput({ onSend });
    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "Shift enter test" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables input when disabled prop is true", () => {
    renderInput({ disabled: true });
    expect(screen.getByLabelText("Message input")).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("renders the model selector with the current model label", () => {
    renderInput({ model: "claude-opus-4-6" });
    expect(screen.getByRole("button", { name: "Switch model" })).toHaveTextContent("Opus");
  });

  it("renders the codebase toggle reflecting its state", () => {
    renderInput({ codebaseResearch: true });
    expect(screen.getByRole("button", { name: "Codebase research on" })).toBeInTheDocument();
  });

  it("fills the input with a quick action prompt", async () => {
    renderInput();
    fireEvent.click(screen.getByLabelText("AI actions"));
    fireEvent.click(screen.getByText("Review a ticket"));
    const textarea = screen.getByLabelText("Message input") as HTMLTextAreaElement;
    await waitFor(() => {
      expect(textarea.value).toBe("/review-story ");
    });
  });
});
