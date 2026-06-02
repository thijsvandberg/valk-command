import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EpicProgressBar } from "./EpicProgressBar";
import type { EpicProgressItem } from "@/app/api/epics/progress/route";

function makeEpic(overrides: Partial<EpicProgressItem> = {}): EpicProgressItem {
  return {
    key: "VPL-E1",
    name: "Epic One",
    totalTickets: 4,
    completedTickets: 1,
    totalPoints: 10,
    completedPoints: 5,
    inProgressPoints: 2,
    todoPoints: 3,
    sprintIds: ["12"],
    perSprint: [{ sprintId: "12", total: 4, completed: 1 }],
    pointsBased: true,
    ...overrides,
  };
}

describe("EpicProgressBar", () => {
  it("renders the points-based percentage without the 'by count' tag", () => {
    render(<EpicProgressBar epic={makeEpic()} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("by count")).not.toBeInTheDocument();
  });

  it("exposes the percentage via the progressbar role", () => {
    render(<EpicProgressBar epic={makeEpic()} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("falls back to ticket-count progress with a 'by count' tag when there are no points", () => {
    render(
      <EpicProgressBar
        epic={makeEpic({ totalPoints: 0, completedPoints: 0, inProgressPoints: 0, todoPoints: 0, totalTickets: 4, completedTickets: 3 })}
      />,
    );
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("by count")).toBeInTheDocument();
  });

  it("renders 0% for an empty epic", () => {
    render(
      <EpicProgressBar
        epic={makeEpic({ totalTickets: 0, completedTickets: 0, totalPoints: 0, completedPoints: 0, inProgressPoints: 0, todoPoints: 0 })}
      />,
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
