import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintSelector } from "./SprintSelector";
import type { Sprint } from "@/types/ticket";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "1",
    name: "Sprint 1",
    state: "active",
    dateRange: "Apr 1 - Apr 14",
    ticketCount: 5,
    startDate: "2026-04-01",
    endDate: "2026-04-14",
    ...overrides,
  };
}

const SPRINTS: Sprint[] = [
  makeSprint({ id: "1", name: "Active Sprint", state: "active" }),
  makeSprint({ id: "2", name: "Future Sprint", state: "future" }),
  makeSprint({ id: "3", name: "Closed Sprint", state: "closed" }),
];

beforeEach(() => {
  // The shared body persists the team filter; a leaked value would hide fixtures.
  localStorage.clear();
});

describe("SprintSelector", () => {
  it("renders active and future sprints", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Active Sprint")).toBeTruthy();
    expect(screen.getByText("Future Sprint")).toBeTruthy();
  });

  it("hides closed sprints by default", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Closed Sprint")).toBeNull();
  });

  it("shows closed sprints after expanding the Closed section", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Closed"));
    expect(screen.getByText("Closed Sprint")).toBeTruthy();
  });

  it("calls onSelect with the sprint id when a sprint is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SprintSelector sprints={SPRINTS} onSelect={onSelect} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Future Sprint"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("calls onClose after selecting a sprint", () => {
    const onClose = vi.fn();
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("Active Sprint"));
    expect(onClose).toHaveBeenCalled();
  });

  it("offers the Backlog entry with its count and selects it", () => {
    const onSelect = vi.fn();
    render(
      <SprintSelector sprints={SPRINTS} backlogCount={4} onSelect={onSelect} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("Backlog"));
    expect(onSelect).toHaveBeenCalledWith("__backlog__");
  });

  it("filters sprints by search query", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText("Search sprints...");
    fireEvent.change(input, { target: { value: "Future" } });
    expect(screen.getByText("Future Sprint")).toBeTruthy();
    expect(screen.queryByText("Active Sprint")).toBeNull();
  });

  it("shows a colored dot for active sprints", () => {
    const { container } = render(
      <SprintSelector sprints={[makeSprint({ state: "active" })]} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows the date range as secondary text", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getAllByText("1 Apr - 14 Apr").length).toBeGreaterThan(0);
  });

  it("filters sprints by team via the team filter dropdown", () => {
    const teamSprints: Sprint[] = [
      makeSprint({ id: "a", name: "BO: Sprint 1", state: "active" }),
      makeSprint({ id: "b", name: "BM: Sprint 1", state: "active" }),
    ];
    render(
      <SprintSelector sprints={teamSprints} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTitle("Filter by team"));
    fireEvent.click(screen.getByText("BO"));
    expect(screen.getByText("BO: Sprint 1")).toBeTruthy();
    expect(screen.queryByText("BM: Sprint 1")).toBeNull();
  });

  it("hides the team filter when only one team appears", () => {
    render(
      <SprintSelector sprints={[makeSprint({ name: "BO: Sprint 1" })]} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByTitle("Filter by team")).toBeNull();
  });
});
