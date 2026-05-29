import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FilterChip } from "./FilterChip";

describe("FilterChip", () => {
  it("renders children", () => {
    render(<FilterChip onClick={() => {}}>Sprint sync</FilterChip>);
    expect(screen.getByText("Sprint sync")).toBeInTheDocument();
  });

  it("reflects active state via aria-pressed and accent classes", () => {
    render(
      <FilterChip active onClick={() => {}}>
        Active
      </FilterChip>,
    );
    const btn = screen.getByRole("button", { name: "Active" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn.className).toContain("text-[var(--color-brand-400)]");
  });

  it("is not pressed by default", () => {
    render(<FilterChip onClick={() => {}}>Idle</FilterChip>);
    expect(screen.getByRole("button", { name: "Idle" })).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(<FilterChip onClick={onClick}>Click</FilterChip>);
    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
