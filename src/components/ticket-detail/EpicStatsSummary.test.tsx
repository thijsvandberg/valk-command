import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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

  it("shows total, open/done split and excludes deprecated", () => {
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
    // 3 active stories (deprecated excluded), 1 done, 2 open
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2 open")).toBeInTheDocument();
    expect(screen.getByText("1 done")).toBeInTheDocument();
  });

  it("renders the full status distribution including TEST", () => {
    render(<EpicStatsSummary items={[child("A", "TEST"), child("B", "TO DO")]} />);
    expect(screen.getByTitle("1 TEST")).toBeInTheDocument();
    expect(screen.getByTitle("1 TO DO")).toBeInTheDocument();
    expect(screen.getByTitle("0 IN PROGRESS")).toBeInTheDocument();
    expect(screen.getByTitle("0 DONE")).toBeInTheDocument();
  });

  it("computes story-point total/progress from estimated children", () => {
    render(
      <EpicStatsSummary
        items={[child("A", "DONE", 4), child("B", "TO DO", 5), child("C", "IN PROGRESS", 2)]}
      />,
    );
    // 4 of 11 points done -> 36%
    expect(screen.getByText(/\/11 pts/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("36");
  });

  it("falls back to ticket completion when nothing is estimated", () => {
    render(<EpicStatsSummary items={[child("A", "DONE"), child("B", "TO DO")]} />);
    // No SP -> progress from done/total = 1/2 = 50%
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });
});
