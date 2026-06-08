import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GuestimationPicker } from "./GuestimationPicker";

describe("GuestimationPicker", () => {
  it("labels an unset trigger as 'Set guestimation'", () => {
    render(<GuestimationPicker value={null} onChange={() => {}} />);
    expect(screen.getByRole("button").title).toBe("Set guestimation");
  });

  it("renders the value and a 'PO guess' tooltip when set", () => {
    render(<GuestimationPicker value={5} onChange={() => {}} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByRole("button").title).toBe("Guestimation: 5 (PO guess)");
  });

  it("renders the distinct pencil/dashed motif so it never reads as SP", () => {
    render(<GuestimationPicker value={5} onChange={() => {}} />);
    // The dashed border is the key visual differentiator from the solid SP gauge.
    expect(screen.getByRole("button").className).toContain("border-dashed");
  });

  it("offers the same Fibonacci scale as story points, with no custom entry", () => {
    render(<GuestimationPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    for (const n of ["1", "2", "3", "5", "8"]) {
      expect(screen.getByText(n)).toBeInTheDocument();
    }
    expect(screen.getByTitle("Not applicable")).toBeInTheDocument();
    // A guess is intentionally coarse: no custom-number affordance.
    expect(screen.queryByTitle("Custom value")).not.toBeInTheDocument();
  });

  it("calls onChange with the selected Fibonacci value", () => {
    const onChange = vi.fn();
    render(<GuestimationPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("8"));
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it("calls onChange with 0 for N/A and null for clear", () => {
    const onChange = vi.fn();
    const { rerender } = render(<GuestimationPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Not applicable"));
    expect(onChange).toHaveBeenCalledWith(0);

    rerender(<GuestimationPicker value={5} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByTitle("Clear guestimation"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
