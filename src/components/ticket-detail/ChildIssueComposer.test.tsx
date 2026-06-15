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

  it("clicking the 'to add' hint creates the child, mirroring Enter", () => {
    const onCreate = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={onCreate} placeholder="Create story in this sprint..." />);
    const input = screen.getByPlaceholderText("Create story in this sprint...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Caching of pricing" } });
    fireEvent.click(screen.getByText("↵ to add"));

    expect(onCreate).toHaveBeenCalledWith("Caching of pricing", "Story");
    expect(input.value).toBe("");
  });

  it("the 'to add' hint is disabled while the input is empty", () => {
    const onCreate = vi.fn();
    render(<ChildIssueComposer variant="bar" onCreate={onCreate} />);
    const button = screen.getByText("↵ to add") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onCreate).not.toHaveBeenCalled();
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

  // BRDG-304: the same composer can create a Bridge-local placeholder.
  describe("placeholder option", () => {
    it("does not offer a Placeholder type unless allowPlaceholder is set", () => {
      render(<ChildIssueComposer variant="bar" onCreate={vi.fn()} />);
      fireEvent.click(screen.getByText("Story"));
      expect(screen.queryByText("Placeholder")).not.toBeInTheDocument();
    });

    it("selecting Placeholder switches the chip and creates via onCreatePlaceholder", () => {
      const onCreate = vi.fn();
      const onCreatePlaceholder = vi.fn();
      render(
        <ChildIssueComposer
          variant="bar"
          onCreate={onCreate}
          allowPlaceholder
          onCreatePlaceholder={onCreatePlaceholder}
          placeholder="Create story in BT: 142..."
        />,
      );
      // Open the type dropdown and pick Placeholder.
      fireEvent.click(screen.getByText("Story"));
      fireEvent.click(screen.getByText("Placeholder"));
      // The chip now reads "Placeholder" and the input hint reflects the mode.
      expect(screen.getByText("Placeholder")).toBeInTheDocument();
      const input = screen.getByPlaceholderText("Create placeholder in BT: 142...") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Hide prices flow" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onCreatePlaceholder).toHaveBeenCalledWith("Hide prices flow");
      expect(onCreate).not.toHaveBeenCalled();
      expect(input.value).toBe("");
    });
  });
});
