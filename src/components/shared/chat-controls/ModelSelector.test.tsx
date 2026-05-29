import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ModelSelector, DEFAULT_MODEL_OPTIONS } from "./ModelSelector";

describe("ModelSelector", () => {
  it("shows the label of the current model", () => {
    render(<ModelSelector model="claude-opus-4-6" onModelChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Switch model" })).toHaveTextContent("Opus");
  });

  it("falls back to the first option label when the model is unknown", () => {
    render(<ModelSelector model="nonexistent" onModelChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Switch model" })).toHaveTextContent(
      DEFAULT_MODEL_OPTIONS[0].label
    );
  });

  it("cycles to the next model on click", () => {
    const onModelChange = vi.fn();
    render(<ModelSelector model="claude-sonnet-4-6" onModelChange={onModelChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));
    expect(onModelChange).toHaveBeenCalledWith("claude-opus-4-6");
  });

  it("wraps around to the first model from the last", () => {
    const onModelChange = vi.fn();
    render(<ModelSelector model="claude-opus-4-6" onModelChange={onModelChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));
    expect(onModelChange).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("supports custom options", () => {
    const onModelChange = vi.fn();
    render(
      <ModelSelector
        model="a"
        onModelChange={onModelChange}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />
    );
    const btn = screen.getByRole("button", { name: "Switch model" });
    expect(btn).toHaveTextContent("Alpha");
    fireEvent.click(btn);
    expect(onModelChange).toHaveBeenCalledWith("b");
  });

  it("does not fire when disabled", () => {
    const onModelChange = vi.fn();
    render(<ModelSelector model="claude-sonnet-4-6" onModelChange={onModelChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Switch model" }));
    expect(onModelChange).not.toHaveBeenCalled();
  });
});
