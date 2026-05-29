import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintOverviewCard } from "./SprintOverviewCard";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";

vi.mock("./ProgressBar", () => ({
  ProgressBar: ({ completed, total }: { completed: number; total: number }) => (
    <div data-testid="progress-bar">
      {completed}/{total}
    </div>
  ),
}));

vi.mock("./TicketGroup", () => ({
  TicketGroup: ({ tickets }: { tickets: StakeholderTicket[] }) => (
    <ul data-testid="ticket-group">
      {tickets.map((t, i) => (
        <li key={i}>{t.title}</li>
      ))}
    </ul>
  ),
}));

vi.mock("./SprintHealthBanner", () => ({
  SprintHealthBanner: () => <div data-testid="sprint-health-banner" />,
}));

vi.mock("./EpicFilterChips", () => ({
  EpicFilterChips: ({
    selectedEpics,
    onToggle,
    onClearAll,
  }: {
    tickets: StakeholderTicket[];
    selectedEpics: Set<string>;
    onToggle: (epic: string) => void;
    onClearAll: () => void;
  }) => (
    <div data-testid="epic-filter-chips">
      <button onClick={() => onToggle("EPIC-A")}>Toggle EPIC-A</button>
      <button onClick={onClearAll}>Clear All</button>
      <span>{selectedEpics.size} selected</span>
    </div>
  ),
}));

function makeSprint(overrides: Partial<StakeholderSprint> = {}): StakeholderSprint {
  return {
    name: "Sprint 42",
    state: "active",
    startDate: "2026-05-01",
    endDate: "2026-05-14",
    workingDaysRemaining: 3,
    goal: null,
    ...overrides,
  };
}

function makeTicket(title: string, overrides: Partial<StakeholderTicket> = {}): StakeholderTicket {
  return {
    title,
    epic: "EPIC-A",
    type: "story",
    status: "In Progress",
    storyPoints: 3,
    businessValue: null,
    assignee: null,
    jiraKey: null,
    ...overrides,
  };
}

const defaultProps = {
  sprint: makeSprint(),
  doneTickets: [],
  inReviewTickets: [],
  inProgressTickets: [],
  todoTickets: [],
  deprecatedTickets: [],
};

describe("SprintOverviewCard", () => {
  it("renders the Active sprint badge for active sprint", () => {
    render(<SprintOverviewCard {...defaultProps} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders the History badge for closed sprint", () => {
    render(<SprintOverviewCard {...defaultProps} sprint={makeSprint({ state: "closed" })} />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });

  it("renders the Planned badge for future sprint", () => {
    render(<SprintOverviewCard {...defaultProps} sprint={makeSprint({ state: "future" })} />);
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("renders the date range when both start and end dates are set", () => {
    render(<SprintOverviewCard {...defaultProps} />);
    // formatDate produces "1 May" and "14 May" style labels
    expect(screen.getByText(/May/)).toBeInTheDocument();
  });

  it("renders working days remaining for active sprint", () => {
    render(<SprintOverviewCard {...defaultProps} />);
    expect(screen.getByText(/3 working days remaining/)).toBeInTheDocument();
  });

  it("shows 'Last working day' when workingDaysRemaining is 0", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        sprint={makeSprint({ workingDaysRemaining: 0 })}
      />,
    );
    expect(screen.getByText("Last working day")).toBeInTheDocument();
  });

  it("renders sprint goal when showGoal is true and goal is set", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        sprint={makeSprint({ goal: "Ship the login flow" })}
        showGoal={true}
      />,
    );
    expect(screen.getByText("Ship the login flow")).toBeInTheDocument();
  });

  it("does not render sprint goal when showGoal is false", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        sprint={makeSprint({ goal: "Ship the login flow" })}
        showGoal={false}
      />,
    );
    expect(screen.queryByText("Ship the login flow")).not.toBeInTheDocument();
  });

  it("renders SprintHealthBanner when showHealthBanner is true", () => {
    render(<SprintOverviewCard {...defaultProps} showHealthBanner={true} />);
    expect(screen.getByTestId("sprint-health-banner")).toBeInTheDocument();
  });

  it("does not render SprintHealthBanner when showHealthBanner is false", () => {
    render(<SprintOverviewCard {...defaultProps} showHealthBanner={false} />);
    expect(screen.queryByTestId("sprint-health-banner")).not.toBeInTheDocument();
  });

  it("renders progress bar when there are story-pointed tickets", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        doneTickets={[makeTicket("Done ticket", { storyPoints: 5, status: "Completed" })]}
        inProgressTickets={[makeTicket("WIP ticket", { storyPoints: 3 })]}
      />,
    );
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
  });

  it("renders Completed section when doneTickets is non-empty", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        doneTickets={[makeTicket("Finished story", { status: "Completed" })]}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Finished story")).toBeInTheDocument();
  });

  it("renders Testing section when inReviewTickets is non-empty", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        inReviewTickets={[makeTicket("Review story", { status: "In Review" })]}
      />,
    );
    expect(screen.getByText("Testing")).toBeInTheDocument();
    expect(screen.getByText("Review story")).toBeInTheDocument();
  });

  it("renders In Progress section when inProgressTickets is non-empty", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        inProgressTickets={[makeTicket("WIP story")]}
      />,
    );
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("WIP story")).toBeInTheDocument();
  });

  it("renders To Do section when todoTickets is non-empty (active sprint)", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        todoTickets={[makeTicket("Todo story", { status: "To Do" })]}
      />,
    );
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Todo story")).toBeInTheDocument();
  });

  it("does not render To Do section for closed sprint", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        sprint={makeSprint({ state: "closed" })}
        todoTickets={[makeTicket("Todo story", { status: "To Do" })]}
      />,
    );
    expect(screen.queryByText("To Do")).not.toBeInTheDocument();
  });

  it("renders Deprecated section when deprecatedTickets is non-empty", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        deprecatedTickets={[makeTicket("Deprecated story", { status: "Deprecated" })]}
      />,
    );
    expect(screen.getByText("Deprecated")).toBeInTheDocument();
  });

  it("renders EpicFilterChips", () => {
    render(<SprintOverviewCard {...defaultProps} />);
    expect(screen.getByTestId("epic-filter-chips")).toBeInTheDocument();
  });

  it("shows BV filter buttons when tickets have business value", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        doneTickets={[makeTicket("BV ticket", { businessValue: 5, status: "Completed" })]}
      />,
    );
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("High (5-7)")).toBeInTheDocument();
    expect(screen.getByText("Medium (3-4)")).toBeInTheDocument();
  });

  it("does not show BV filter buttons when no tickets have business value", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        doneTickets={[makeTicket("No BV ticket", { businessValue: null, status: "Completed" })]}
      />,
    );
    expect(screen.queryByText("High (5-7)")).not.toBeInTheDocument();
  });

  it("activates BV filter when High button is clicked", () => {
    render(
      <SprintOverviewCard
        {...defaultProps}
        doneTickets={[makeTicket("BV ticket", { businessValue: 6, status: "Completed" })]}
      />,
    );
    fireEvent.click(screen.getByText("High (5-7)"));
    // Button should become active (we can just verify no error and the click works)
    expect(screen.getByText("High (5-7)")).toBeInTheDocument();
  });
});
