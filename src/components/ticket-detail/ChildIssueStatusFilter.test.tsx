import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChildIssueStatusFilter } from "./ChildIssueStatusFilter";

const baseCounts = {
  all: 5,
  "TO DO": 2,
  "IN PROGRESS": 1,
  DONE: 2,
};

describe("ChildIssueStatusFilter", () => {
  it("renders all status tabs with counts", () => {
    render(
      <ChildIssueStatusFilter
        filter="all"
        setFilter={vi.fn()}
        statusCounts={baseCounts}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("hides status tabs with zero count", () => {
    render(
      <ChildIssueStatusFilter
        filter="all"
        setFilter={vi.fn()}
        statusCounts={{ all: 3, "TO DO": 3, "IN PROGRESS": 0, DONE: 0 }}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.queryByText("In Progress")).not.toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("calls setFilter when a tab is clicked", () => {
    const setFilter = vi.fn();
    render(
      <ChildIssueStatusFilter
        filter="all"
        setFilter={setFilter}
        statusCounts={baseCounts}
      />,
    );
    fireEvent.click(screen.getByText("To Do"));
    expect(setFilter).toHaveBeenCalledWith("TO DO");
  });

  it("highlights the active tab", () => {
    render(
      <ChildIssueStatusFilter
        filter="TO DO"
        setFilter={vi.fn()}
        statusCounts={baseCounts}
      />,
    );
    const todoButton = screen.getByText("To Do").closest("button")!;
    expect(todoButton.className).toContain("text-text-primary");
  });
});
