import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ToggleSwitch } from "./ToggleSwitch";

describe("ToggleSwitch", () => {
  it("renders an accessible switch reflecting checked state", () => {
    render(<ToggleSwitch checked onChange={() => {}} ariaLabel="Enable X" />);
    const sw = screen.getByRole("switch", { name: "Enable X" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("toggles via onChange", () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="Enable X" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("carries the canonical size, a focus-visible ring, and no bg-white knob", () => {
    const { container } = render(
      <ToggleSwitch checked onChange={() => {}} ariaLabel="Enable X" />,
    );
    const cls = (container.firstChild as HTMLElement).className;
    expect(cls).toContain("h-4");
    expect(cls).toContain("w-7");
    expect(cls).toContain("focus-visible:outline-[var(--color-brand-400)]");
    expect(container.innerHTML).not.toContain("bg-white");
  });

  it("supports disabled", () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} ariaLabel="X" disabled />);
    const sw = screen.getByRole("switch") as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
  });
});
