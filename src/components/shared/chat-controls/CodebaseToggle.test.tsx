import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CodebaseToggle } from "./CodebaseToggle";

describe("CodebaseToggle", () => {
  it("reflects the off state", () => {
    render(<CodebaseToggle enabled={false} onChange={() => {}} />);
    const btn = screen.getByRole("button", { name: "Codebase research off" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("reflects the on state", () => {
    render(<CodebaseToggle enabled onChange={() => {}} />);
    const btn = screen.getByRole("button", { name: "Codebase research on" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles on when off", () => {
    const onChange = vi.fn();
    render(<CodebaseToggle enabled={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Codebase research off" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles off when on", () => {
    const onChange = vi.fn();
    render(<CodebaseToggle enabled onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Codebase research on" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(<CodebaseToggle enabled={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "Codebase research off" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
