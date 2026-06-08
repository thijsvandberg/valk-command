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
    expect(input.placeholder).toBe("cap");
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
});
