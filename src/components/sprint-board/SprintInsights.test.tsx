import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SprintInsights } from "./SprintInsights";
import type { Ticket } from "@/types/ticket";

const MOCK_TICKETS: Ticket[] = [
  {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    jiraStatus: "IN PROGRESS",
    storyPoints: 3,
    assignee: null,
    epic: null,
    flagged: false,
    poStatus: null,
    qualityScore: 45,
    qualityStale: false,
    notes: "",
    sprintId: "s1",
  },
];

describe("SprintInsights", () => {
  it("renders all insight categories", () => {
    render(<SprintInsights tickets={MOCK_TICKETS} />);

    expect(screen.getByText("Stale Stories")).toBeTruthy();
    expect(screen.getByText("Unreviewed")).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getByText("Avg Quality")).toBeTruthy();
  });

  it("shows the sprint insights header", () => {
    render(<SprintInsights tickets={MOCK_TICKETS} />);
    expect(screen.getByText("Sprint Insights")).toBeTruthy();
  });

  it("collapses and expands on click", () => {
    render(<SprintInsights tickets={MOCK_TICKETS} />);

    expect(screen.getByText("Stale Stories")).toBeTruthy();

    fireEvent.click(screen.getByText("Sprint Insights"));

    expect(screen.queryByText("Stale Stories")).toBeNull();

    fireEvent.click(screen.getByText("Sprint Insights"));

    expect(screen.getByText("Stale Stories")).toBeTruthy();
  });

  it("displays numeric values for insights", () => {
    render(<SprintInsights tickets={MOCK_TICKETS} />);

    const container = document.querySelector(".grid");
    expect(container).toBeTruthy();
    expect(container!.textContent).toMatch(/\d+/);
  });
});
