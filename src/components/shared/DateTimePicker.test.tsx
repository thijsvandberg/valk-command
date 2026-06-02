import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DateTimePicker } from "./DateTimePicker";

describe("DateTimePicker", () => {
  it("shows the placeholder when value is empty", () => {
    render(<DateTimePicker value="" onChange={vi.fn()} placeholder="Pick a date" />);
    expect(screen.getByText("Pick a date")).toBeInTheDocument();
  });

  it("renders a formatted label with weekday for a date with time", () => {
    render(<DateTimePicker value="2026-05-22T14:04" onChange={vi.fn()} />);
    expect(screen.getByText("Fri 22 May 2026 · 14:04")).toBeInTheDocument();
  });

  it("renders a date-only label with weekday when time is absent", () => {
    render(<DateTimePicker value="2026-05-22" onChange={vi.fn()} />);
    expect(screen.getByText("Fri 22 May 2026")).toBeInTheDocument();
  });

  it("opens the calendar and emits the picked day, preserving the time", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-05-22T14:04" onChange={onChange} ariaLabel="Start date" />);

    fireEvent.click(screen.getByLabelText("Start date"));
    expect(screen.getByText("May 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onChange).toHaveBeenCalledWith("2026-05-10T14:04");
  });

  it("closes the popover after picking a day when closeOnSelect is set", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-05-22T14:04" onChange={onChange} ariaLabel="Start date" closeOnSelect />);

    fireEvent.click(screen.getByLabelText("Start date"));
    expect(screen.getByText("May 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onChange).toHaveBeenCalledWith("2026-05-10T14:04");
    expect(screen.queryByText("May 2026")).not.toBeInTheDocument();
  });

  it("navigates months", () => {
    render(<DateTimePicker value="2026-05-22T14:04" onChange={vi.fn()} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));

    fireEvent.click(screen.getByLabelText("Next month"));
    expect(screen.getByText("June 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous month"));
    fireEvent.click(screen.getByLabelText("Previous month"));
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("normalizes a typed time on blur and emits date + time", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-05-22" onChange={onChange} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));

    const timeInput = screen.getByPlaceholderText("--:--");
    fireEvent.change(timeInput, { target: { value: "930" } });
    fireEvent.blur(timeInput);

    expect(onChange).toHaveBeenCalledWith("2026-05-22T09:30");
  });

  it("clears the time but keeps the date", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-05-22T14:04" onChange={onChange} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));

    fireEvent.click(screen.getByLabelText("Clear time"));
    expect(onChange).toHaveBeenCalledWith("2026-05-22");
  });

  it("clears the entire value", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value="2026-05-22T14:04" onChange={onChange} ariaLabel="Start date" />);
    fireEvent.click(screen.getByLabelText("Start date"));

    fireEvent.click(screen.getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
