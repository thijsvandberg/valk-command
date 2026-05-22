import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditableConversationTitle } from "./EditableConversationTitle";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EditableConversationTitle", () => {
  const defaultProps = {
    conversationId: "conv-1",
    title: "Test conversation",
    onTitleSaved: vi.fn(),
  };

  it("renders the title as a button", () => {
    render(<EditableConversationTitle {...defaultProps} />);
    expect(screen.getByTestId("editable-title")).toHaveTextContent("Test conversation");
  });

  it("enters edit mode on click", () => {
    render(<EditableConversationTitle {...defaultProps} />);
    fireEvent.click(screen.getByTestId("editable-title"));
    expect(screen.getByTestId("title-input")).toBeInTheDocument();
    expect(screen.getByTestId("title-input")).toHaveValue("Test conversation");
  });

  it("saves on Enter key", async () => {
    const onSaved = vi.fn();
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: "conv-1", title: "Renamed" }),
    } as Response);

    render(<EditableConversationTitle {...defaultProps} onTitleSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("editable-title"));

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("cancels on Escape without saving", () => {
    const onSaved = vi.fn();
    render(<EditableConversationTitle {...defaultProps} onTitleSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("editable-title"));

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByTestId("editable-title")).toHaveTextContent("Test conversation");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not save when value is empty", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<EditableConversationTitle {...defaultProps} />);
    fireEvent.click(screen.getByTestId("editable-title"));

    const input = screen.getByTestId("title-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("editable-title")).toBeInTheDocument();
  });

  it("does not save when value is unchanged", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<EditableConversationTitle {...defaultProps} />);
    fireEvent.click(screen.getByTestId("editable-title"));

    const input = screen.getByTestId("title-input");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
