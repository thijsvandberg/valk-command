import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EpicStatsSummary } from "./EpicStatsSummary";
import type { EpicChild, JiraStatus } from "@/types/ticket";

function child(key: string, jiraStatus: JiraStatus, storyPoints: number | null = null): EpicChild {
  return {
    key,
    title: key,
    type: "story",
    jiraStatus,
    assignee: null,
    storyPoints,
    businessValue: null,
    subtaskCount: 0,
    readiness: null,
    jiraRank: null,
    sprintName: null,
  } as EpicChild;
}

describe("EpicStatsSummary", () => {
  it("renders nothing when there are no active children", () => {
    const { container } = render(<EpicStatsSummary items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the total and a status pill per present status (excludes deprecated)", () => {
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
    // 3 active stories (deprecated excluded), one pill each
    expect(screen.getByText("3")).toBeInTheDocument();
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

  it("shows the story-point total and a count-based completion percentage", () => {
    render(
      <EpicStatsSummary
        items={[child("A", "DONE", 4), child("B", "TO DO", 5), child("C", "IN PROGRESS", 2)]}
      />,
    );
    // SP total shown as 4/11 pts; bar/percentage are by count: 1 done of 3 -> 33%
    expect(screen.getByText(/\/11 pts/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
  });

  it("computes completion from ticket counts", () => {
    render(<EpicStatsSummary items={[child("A", "DONE"), child("B", "TO DO")]} />);
    // 1 done of 2 -> 50%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });
});
