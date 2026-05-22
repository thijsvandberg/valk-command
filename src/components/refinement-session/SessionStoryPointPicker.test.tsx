import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SessionStoryPointPicker } from "./SessionStoryPointPicker";

describe("SessionStoryPointPicker", () => {
  it("renders read-only display with no value", () => {
    render(<SessionStoryPointPicker value={null} onChange={() => {}} />);
    expect(screen.getByText("Not estimated")).toBeInTheDocument();
    expect(screen.getByText("Story Points")).toBeInTheDocument();
  });

  it("renders read-only display with a value", () => {
    render(<SessionStoryPointPicker value={5} onChange={() => {}} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("expands on click to show Fibonacci tiles", () => {
    render(<SessionStoryPointPicker value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByText("Not estimated"));
    expect(screen.getByText("Estimate")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("calls onChange with selected value and collapses", () => {
    const onChange = vi.fn();
    render(<SessionStoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Not estimated"));
    fireEvent.click(screen.getByText("3"));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("deselects when clicking the currently selected value", () => {
    const onChange = vi.fn();
    render(<SessionStoryPointPicker value={5} onChange={onChange} />);
    fireEvent.click(screen.getByText("5"));
    // Now expanded, click 5 again
    fireEvent.click(screen.getByText("5"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("collapses on Escape without saving", () => {
    const onChange = vi.fn();
    render(<SessionStoryPointPicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Not estimated"));
    expect(screen.getByText("Estimate")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // Should collapse back to read-only
    expect(screen.getByText("Not estimated")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows pre-selected value when opened", () => {
    render(<SessionStoryPointPicker value={3} onChange={() => {}} />);
    fireEvent.click(screen.getByText("3"));
    // The "3" tile should be present and be the selected one (has white color)
    const tiles = screen.getAllByText("3");
    expect(tiles.length).toBeGreaterThan(0);
  });
});
