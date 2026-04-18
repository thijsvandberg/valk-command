import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintSelector } from "./SprintSelector";
import type { Sprint } from "@/types/ticket";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "1",
    name: "Sprint 1",
    state: "active",
    dateRange: "Apr 1 - Apr 14",
    ticketCount: 5,
    ...overrides,
  };
}

const SPRINTS: Sprint[] = [
  makeSprint({ id: "1", name: "Active Sprint", state: "active" }),
  makeSprint({ id: "2", name: "Future Sprint", state: "future" }),
  makeSprint({ id: "3", name: "Closed Sprint", state: "closed" }),
];

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

  it("shows closed sprints after clicking the toggle", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText(/Closed sprints/));
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
    // Active sprint renders a colored dot span inside each button
    const dots = container.querySelectorAll("span.rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows date range as secondary text", () => {
    render(
      <SprintSelector sprints={SPRINTS} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getAllByText("Apr 1 - Apr 14").length).toBeGreaterThan(0);
  });
});
