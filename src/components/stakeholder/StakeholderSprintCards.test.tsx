import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StakeholderSprintCards, type StakeholderSprintCardsProps } from "./StakeholderSprintCards";
import type { StakeholderSprint } from "@/lib/stakeholder-data";

// Child cards are covered by their own tests; the branches under test here
// (loading / error / no-sprint) all early-return before rendering them.

const SPRINT: StakeholderSprint = {
  name: "BM: 135",
  state: "active",
  startDate: null,
  endDate: null,
  workingDaysRemaining: null,
  goal: null,
};

function baseProps(overrides: Partial<StakeholderSprintCardsProps> = {}): StakeholderSprintCardsProps {
  return {
    isLoading: false,
    rawTickets: [],
    stakeholderSprint: SPRINT,
    isCompareMode: false,
    prevStakeholderSprint: null,
    isPrevLoading: false,
    carriedKeys: new Set<string>(),
    isCarryOverLoading: false,
    previousSprint: null,
    doneTickets: [],
    inReviewTickets: [],
    inProgressTickets: [],
    todoTickets: [],
    deprecatedTickets: [],
    prevDoneTickets: [],
    prevInReviewTickets: [],
    prevInProgressTickets: [],
    prevTodoTickets: [],
    prevDeprecatedTickets: [],
    prevAllTickets: [],
    showHealthBadge: false,
    velocityData: [],
    isVelocityLoading: false,
    lastUpdatedDisplay: "Just now",
    ...overrides,
  };
}

describe("StakeholderSprintCards", () => {
  it("shows a recoverable error state on fetch failure, not an empty view (BRDG-423)", () => {
    const onRetry = vi.fn();
    render(
      <StakeholderSprintCards
        {...baseProps({ rawTickets: undefined, error: new Error("Sprint feed is down"), onRetry })}
      />,
    );
    expect(screen.getByText("Sprint feed is down")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the loading state while fetching", () => {
    render(<StakeholderSprintCards {...baseProps({ isLoading: true, rawTickets: undefined })} />);
    expect(screen.getByText("Loading sprint data...")).toBeInTheDocument();
  });

  it("uses an empty state (not a loading state) when no sprint is selected", () => {
    render(<StakeholderSprintCards {...baseProps({ stakeholderSprint: null })} />);
    expect(screen.getByText("No sprint selected")).toBeInTheDocument();
    // The old code misused LoadingState (role="status") for this non-loading case.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
