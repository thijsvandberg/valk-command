import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TitleInput } from "./TitleInput";

describe("TitleInput", () => {
  it("renders an input with the provided value", () => {
    render(<TitleInput value="My Story Title" onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("My Story Title")).toBeInTheDocument();
  });

  it("calls onChange when input changes", () => {
    const onChange = vi.fn();
    render(<TitleInput value="" onChange={onChange} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New Title" } });

    expect(onChange).toHaveBeenCalledWith("New Title");
  });

  it("renders with default placeholder", () => {
    render(<TitleInput value="" onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText("Story title (optional, AI will suggest)")).toBeInTheDocument();
  });

  it("renders with custom placeholder when provided", () => {
    render(<TitleInput value="" onChange={vi.fn()} placeholder="Enter story title..." />);

    expect(screen.getByPlaceholderText("Enter story title...")).toBeInTheDocument();
  });

  it("is a text input element", () => {
    render(<TitleInput value="Test" onChange={vi.fn()} />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("type", "text");
  });

  it("reflects updated value on re-render", () => {
    const { rerender } = render(<TitleInput value="First" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("First")).toBeInTheDocument();

    rerender(<TitleInput value="Updated" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("Updated")).toBeInTheDocument();
  });

  it("does not render the suggest button when onSuggest is omitted", () => {
    render(<TitleInput value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /suggest titles/i })).toBeNull();
  });

  it("renders the suggest button and fires onSuggest when clicked", () => {
    const onSuggest = vi.fn().mockResolvedValue(true);
    render(<TitleInput value="" onChange={vi.fn()} onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /suggest titles/i }));
    expect(onSuggest).toHaveBeenCalledTimes(1);
  });

  it("disables the suggest button when suggestDisabled is true", () => {
    const onSuggest = vi.fn();
    render(<TitleInput value="" onChange={vi.fn()} onSuggest={onSuggest} suggestDisabled />);

    const button = screen.getByRole("button", { name: /suggest titles/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSuggest).not.toHaveBeenCalled();
  });
});
