import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FullnessMeter } from "./FullnessMeter";

describe("FullnessMeter", () => {
  it("shows the used total and the capacity in the input", () => {
    render(<FullnessMeter used={12} capacity={20} onCapacityChange={() => {}} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByLabelText("Sprint pencil capacity")).toHaveValue(20);
  });

  it("shows the used total but no capacity (placeholder) when capacity is unset", () => {
    render(<FullnessMeter used={9} capacity={null} onCapacityChange={() => {}} />);
    expect(screen.getByText("9")).toBeInTheDocument();
    const input = screen.getByLabelText("Sprint pencil capacity") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("–");
  });

  it("commits a typed capacity on Enter", () => {
    const onCapacityChange = vi.fn();
    render(<FullnessMeter used={5} capacity={null} onCapacityChange={onCapacityChange} />);
    const input = screen.getByLabelText("Sprint pencil capacity");
    fireEvent.change(input, { target: { value: "30" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCapacityChange).toHaveBeenCalledWith(30);
  });

  it("clears the capacity (null) when the field is emptied and committed", () => {
    const onCapacityChange = vi.fn();
    render(<FullnessMeter used={5} capacity={20} onCapacityChange={onCapacityChange} />);
    const input = screen.getByLabelText("Sprint pencil capacity");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCapacityChange).toHaveBeenCalledWith(null);
  });

  it("does not persist an out-of-range capacity", () => {
    const onCapacityChange = vi.fn();
    render(<FullnessMeter used={5} capacity={null} onCapacityChange={onCapacityChange} />);
    const input = screen.getByLabelText("Sprint pencil capacity");
    fireEvent.change(input, { target: { value: "1000" } });
    fireEvent.blur(input);
    expect(onCapacityChange).not.toHaveBeenCalled();
  });

  it("renders a teal fill bar while within capacity (full sprint reads calm)", () => {
    render(<FullnessMeter used={25} capacity={25} onCapacityChange={() => {}} />);
    const fill = screen.getByTestId("fullness-bar-fill");
    expect(fill.style.backgroundColor).toBe("var(--color-brand-400)");
  });

  it("turns only the fill bar red when over capacity (neutral pill, no other colour)", () => {
    render(<FullnessMeter used={34} capacity={20} onCapacityChange={() => {}} />);
    const fill = screen.getByTestId("fullness-bar-fill");
    expect(fill.style.backgroundColor).toBe("var(--color-status-error)");
    // The used total stays neutral - the bar is the only over-capacity signal.
    expect(screen.getByText("34").style.color).toBe("");
  });

  it("shows no bar when no capacity is set", () => {
    render(<FullnessMeter used={9} capacity={null} onCapacityChange={() => {}} />);
    expect(screen.queryByTestId("fullness-bar-fill")).not.toBeInTheDocument();
  });

  it("splits the bar into the epic's brand share and a dark grey remainder when ownUsed is set", () => {
    render(<FullnessMeter used={13} ownUsed={4} capacity={20} onCapacityChange={() => {}} />);
    const own = screen.getByTestId("fullness-bar-fill");
    const rest = screen.getByTestId("fullness-bar-rest");
    expect(own.style.backgroundColor).toBe("var(--color-brand-400)");
    // The brand segment covers this epic's 4/20, the dark grey one the full 13/20.
    expect(own.style.width).toBe("20%");
    expect(rest.style.width).toBe("65%");
    expect(rest.style.backgroundColor.toLowerCase()).toContain("currentcolor");
  });

  it("turns the whole used span red when the sprint is over capacity, even when split", () => {
    render(<FullnessMeter used={25} ownUsed={5} capacity={20} onCapacityChange={() => {}} />);
    expect(screen.getByTestId("fullness-bar-fill").style.backgroundColor).toBe("var(--color-status-error)");
    expect(screen.getByTestId("fullness-bar-rest").style.backgroundColor).toBe("var(--color-status-error)");
  });
});
