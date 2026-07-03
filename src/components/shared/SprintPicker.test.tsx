import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintPicker } from "./SprintPicker";

const SPRINTS = [
  { id: 1, name: "Sprint 10", state: "active", startDate: "2026-01-01", endDate: "2026-01-14" },
  { id: 2, name: "Sprint 11", state: "future", startDate: "2026-01-15", endDate: "2026-01-28" },
  { id: 3, name: "Sprint 9", state: "closed", startDate: "2025-12-15", endDate: "2025-12-28" },
  { id: 4, name: "Hidden Sprint", state: "active", startDate: null, endDate: null, hidden: true },
];

beforeEach(() => {
  localStorage.clear();
});

describe("SprintPicker", () => {
  it("renders trigger with selected sprint name", () => {
    render(<SprintPicker value="1" sprints={SPRINTS} onChange={vi.fn()} />);
    expect(screen.getByText("Sprint 10")).toBeInTheDocument();
  });

  it("renders 'None' when no value selected", () => {
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={vi.fn()} />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("opens popover and shows available sprints (active + future, not closed/hidden)", () => {
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("None"));
    expect(screen.getByText("Sprint 10")).toBeInTheDocument();
    expect(screen.getByText("Sprint 11")).toBeInTheDocument();
    expect(screen.queryByText("Sprint 9")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden Sprint")).not.toBeInTheDocument();
  });

  it("shows 'No sprint' option in list", () => {
    render(<SprintPicker value="1" sprints={SPRINTS} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByText("Sprint 10")[0]);
    expect(screen.getByText("No sprint")).toBeInTheDocument();
  });

  it("calls onChange with sprint id on selection", () => {
    const onChange = vi.fn();
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={onChange} />);
    fireEvent.click(screen.getByText("None"));
    fireEvent.click(screen.getByText("Sprint 11"));
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("calls onChange with null for 'No sprint'", () => {
    const onChange = vi.fn();
    render(<SprintPicker value="1" sprints={SPRINTS} onChange={onChange} />);
    fireEvent.click(screen.getAllByText("Sprint 10")[0]);
    fireEvent.click(screen.getByText("No sprint"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("filters sprints by search query", () => {
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("None"));
    const input = screen.getByPlaceholderText("Search sprints...");
    fireEvent.change(input, { target: { value: "11" } });
    expect(screen.getByText("Sprint 11")).toBeInTheDocument();
    expect(screen.queryByText("Sprint 10")).not.toBeInTheDocument();
  });

  it("shows the Active state badge for active sprints", () => {
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByText("None"));
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders badge variant with 'Sprint' label when no value", () => {
    render(<SprintPicker value={null} sprints={SPRINTS} onChange={vi.fn()} variant="badge" />);
    expect(screen.getByText("Sprint")).toBeInTheDocument();
  });
});
