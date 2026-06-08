import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildIssueComposer } from "./ChildIssueComposer";

describe("ChildIssueComposer", () => {
  it("renders the bar variant with a type chip and an Enter hint", () => {
    render(<ChildIssueComposer variant="bar" onCreate={vi.fn()} placeholder="Create story in this sprint..." />);
    expect(screen.getByPlaceholderText("Create story in this sprint...")).toBeInTheDocument();
    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(screen.getByText("↵ to add")).toBeInTheDocument();
  });

  it("creates on Enter, clears the input, and keeps it focused for rapid entry", () => {
    const onCreate = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={onCreate} placeholder="Create story in this sprint..." />);
    const input = screen.getByPlaceholderText("Create story in this sprint...") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "New story" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCreate).toHaveBeenCalledWith("New story", "Story");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("does not create on Enter when the input is only whitespace", () => {
    const onCreate = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={onCreate} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("Escape on an empty input calls onEscapeEmpty (closes the composer)", () => {
    const onEscapeEmpty = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={vi.fn()} onEscapeEmpty={onEscapeEmpty} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onEscapeEmpty).toHaveBeenCalledTimes(1);
  });

  it("Escape first clears the text, only closing on a second (empty) Escape", () => {
    const onEscapeEmpty = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={vi.fn()} onEscapeEmpty={onEscapeEmpty} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "draft" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(onEscapeEmpty).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onEscapeEmpty).toHaveBeenCalledTimes(1);
  });
});
