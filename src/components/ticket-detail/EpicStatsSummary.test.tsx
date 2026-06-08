import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpicStatsSummary } from "./EpicStatsSummary";
import type { EpicChild, JiraStatus } from "@/types/ticket";

function child(
  key: string,
  jiraStatus: JiraStatus,
  storyPoints: number | null = null,
  businessValue: number | null = null,
): EpicChild {
  return {
    key,
    title: key,
    type: "story",
    jiraStatus,
    assignee: null,
    storyPoints,
    businessValue,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
    sprintName: null,
  } as EpicChild;
}

describe("EpicStatsSummary", () => {
  // The metric toggle persists via localStorage; reset so each test starts on "items".
  beforeEach(() => localStorage.clear());

  it("renders nothing when there are no active children", () => {
    const { container } = render(<EpicStatsSummary items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the item total and a status pill per present status (excludes deprecated)", () => {
    render(
      <EpicStatsSummary
        items={[
          child("A", "TO DO"),
          child("B", "IN PROGRESS"),
          child("C", "DONE"),
          child("D", "DEPRECATED"),
        ]}
      />,
    );
    // 3 active stories (deprecated excluded): items toggle total + one pill each
    expect(screen.getByRole("button", { name: /3\s*items/i })).toBeInTheDocument();
    expect(screen.getByText("TO DO: 1")).toBeInTheDocument();
    expect(screen.getByText("IN PROGRESS: 1")).toBeInTheDocument();
    expect(screen.getByText("DONE: 1")).toBeInTheDocument();
  });

  it("shows a status pill (incl. TEST) for each present status and omits empty ones", () => {
    render(<EpicStatsSummary items={[child("A", "TEST"), child("B", "TO DO")]} />);
    expect(screen.getByText("TEST: 1")).toBeInTheDocument();
    expect(screen.getByText("TO DO: 1")).toBeInTheDocument();
    expect(screen.queryByText(/IN PROGRESS/)).toBeNull();
    expect(screen.queryByText(/DONE/)).toBeNull();
  });

  it("calls onSelectStatus when a status pill is clicked (filter)", () => {
    const onSelectStatus = vi.fn();
    render(
      <EpicStatsSummary
        items={[child("A", "TO DO"), child("B", "IN PROGRESS")]}
        onSelectStatus={onSelectStatus}
      />,
    );
    fireEvent.click(screen.getByText("IN PROGRESS: 1"));
    expect(onSelectStatus).toHaveBeenCalledWith("IN PROGRESS");
  });

  it("exposes per-metric totals and defaults the bar to item completion", () => {
    render(
      <EpicStatsSummary
        items={[child("A", "DONE", 4, 8), child("B", "TO DO", 5, 2), child("C", "IN PROGRESS", 2, 0)]}
      />,
    );
    // Toggle shows each total: 3 items, 11 SP, 10 BV
    expect(screen.getByRole("button", { name: /3\s*items/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /11\s*SP/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /10\s*BV/i })).toBeInTheDocument();
    // Default metric is items: 1 done of 3 -> 33%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("recomputes the bar for the selected metric when the toggle is switched", () => {
    render(<EpicStatsSummary items={[child("A", "DONE", 4), child("B", "TO DO", 6)]} />);
    // items: 1 done of 2 -> 50%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    fireEvent.click(screen.getByRole("button", { name: /10\s*SP/i }));
    // SP: 4 of 10 done -> 40%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
  });
});
