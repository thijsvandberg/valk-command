import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TicketStatusPill, type TicketPillHoverData } from "./TicketStatusPill";
import { JIRA_STATUS_ABBREVIATIONS, READINESS_CONFIG } from "@/types/ticket";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}));
import { usePathname } from "next/navigation";
const mockUsePathname = vi.mocked(usePathname);

// The card calls useHoverCardEdits for its default editors (BRDG-276). Mock it so
// the card is deterministic and never touches SWR/fetch in tests.
vi.mock("@/hooks/useHoverCardEdits", () => ({ useHoverCardEdits: vi.fn() }));
import { useHoverCardEdits } from "@/hooks/useHoverCardEdits";
const mockedEdits = vi.mocked(useHoverCardEdits);
const SPRINT_42 = { id: "42", name: "Sprint 42", dateRange: "", state: "active" as const, ticketCount: 0 };
function defaultEdits(overrides: Partial<ReturnType<typeof useHoverCardEdits>> = {}) {
  return {
    sprints: [SPRINT_42],
    isFollowed: false,
    onStoryPointsChange: vi.fn(),
    onBusinessValueChange: vi.fn(),
    onSprintChange: vi.fn(),
    onEpicChange: vi.fn(),
    onAssigneeChange: vi.fn(),
    onToggleFollow: vi.fn(),
    onRunReview: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("JIRA_STATUS_ABBREVIATIONS", () => {
  it("maps all JiraStatus values", () => {
    expect(JIRA_STATUS_ABBREVIATIONS["TO DO"]).toBe("TODO");
    expect(JIRA_STATUS_ABBREVIATIONS["IN PROGRESS"]).toBe("PROG");
    expect(JIRA_STATUS_ABBREVIATIONS["TEST"]).toBe("TEST");
    expect(JIRA_STATUS_ABBREVIATIONS["DONE"]).toBe("DONE");
    expect(JIRA_STATUS_ABBREVIATIONS["DEPRECATED"]).toBe("DEPR");
  });
});

describe("READINESS_CONFIG", () => {
  it("has all four readiness values with label, color, and bg", () => {
    const values = ["drafting", "waiting_for_feedback", "ready_to_refine", "on_hold"] as const;
    for (const v of values) {
      expect(READINESS_CONFIG[v].label).toBeTruthy();
      expect(READINESS_CONFIG[v].color).toBeTruthy();
      expect(READINESS_CONFIG[v].bg).toBeTruthy();
    }
  });
});

describe("TicketStatusPill", () => {
  it("renders ticket key as link to internal ticket view", () => {
    render(<TicketStatusPill ticketKey="VPL-123" jiraStatus="TO DO" />);
    const link = screen.getByText("VPL-123").closest("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/tickets/VPL-123");
  });

  it("renders abbreviated Jira status text", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="IN PROGRESS" />);
    expect(screen.getByText("PROG")).toBeTruthy();
  });

  it("opens key dropdown on regular click", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.getByText("Copy Jira URL")).toBeTruthy();
    expect(screen.getByText("Open in Jira")).toBeTruthy();
  });

  it("offers a same-tab View ticket link in the key dropdown", () => {
    mockUsePathname.mockReturnValue("/");
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    fireEvent.click(screen.getByText("VPL-1"));
    const link = screen.getByText("View ticket").closest("a");
    expect(link?.getAttribute("href")).toBe("/tickets/VPL-1");
    expect(link?.getAttribute("target")).toBeNull();
  });

  it("hides View ticket when already on that ticket's single view", () => {
    mockUsePathname.mockReturnValue("/tickets/VPL-1");
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.queryByText("View ticket")).toBeNull();
    expect(screen.getByText("Open Story Writer")).toBeTruthy();
  });

  it("hides Open Story Writer when already on the story writer", () => {
    mockUsePathname.mockReturnValue("/tickets/VPL-1/write");
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.queryByText("Open Story Writer")).toBeNull();
    expect(screen.getByText("View ticket")).toBeTruthy();
  });

  it("renders issue type icon segment when issueType provided", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" issueType="story" />);
    expect(screen.getByLabelText("Story")).toBeTruthy();
  });

  it("opens issue type dropdown when onIssueTypeChange is wired", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" issueType="story" onIssueTypeChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Change issue type"));
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByText("Task")).toBeTruthy();
  });

  it("calls onIssueTypeChange when type selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" issueType="story" onIssueTypeChange={onChange} />,
    );
    fireEvent.click(screen.getByLabelText("Change issue type"));
    fireEvent.click(screen.getByText("Bug"));
    expect(onChange).toHaveBeenCalledWith("bug");
  });

  it("shows 'Copy with title' option when title prop is provided", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" title="My ticket" />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.getByText("Copy with title")).toBeTruthy();
  });

  it("hides 'Copy with title' option when no title prop", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.queryByText("Copy with title")).toBeNull();
  });

  it("shows the readiness segment by default", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness={null} />,
    );
    expect(container.querySelector(".bg-overlay-strong")).toBeTruthy();
  });

  it("omits the readiness segment when showReadiness is false (default variant)", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness={null} showReadiness={false} />,
    );
    expect(container.querySelector(".bg-overlay-strong")).toBeNull();
    // The status segment is still present.
    expect(screen.getByText("TODO")).toBeTruthy();
  });

  it("omits the readiness segment when showReadiness is false (list variant)", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness={null} showReadiness={false} variant="list" />,
    );
    expect(container.querySelector(".bg-overlay-strong")).toBeNull();
  });

  it("shows the null-state gray dot when readiness is null and no callback, but stays non-interactive", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness={null} />,
    );
    const readinessBtn = screen.getByLabelText("Ready for Development");
    expect(readinessBtn).toBeTruthy();
    expect((readinessBtn as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".bg-overlay-strong")).toBeTruthy();
  });

  it("renders readiness dot with icon when readiness is set", () => {
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness="drafting" />,
    );
    expect(screen.getByLabelText("Drafting")).toBeTruthy();
  });

  it("shows readiness segment (null state dot) when callback is wired but readiness is null", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness={null}
        onReadinessChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Ready for Development")).toBeTruthy();
  });

  it("opens readiness dropdown on click when callback provided", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="drafting"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Drafting"));
    expect(screen.getByText("Waiting for Feedback")).toBeTruthy();
    expect(screen.getByText("Ready to Refine")).toBeTruthy();
    expect(screen.getByText("On Hold")).toBeTruthy();
    expect(screen.getByText("Ready for Development")).toBeTruthy();
  });

  it("calls onReadinessChange when option selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="drafting"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Drafting"));
    fireEvent.click(screen.getByText("On Hold"));
    expect(onChange).toHaveBeenCalledWith("on_hold");
  });

  it("calls onReadinessChange with null when 'Ready for Development' selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        readiness="on_hold"
        onReadinessChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("On Hold"));
    fireEvent.click(screen.getByText("Ready for Development"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does not open dropdown when no onReadinessChange provided", () => {
    render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" readiness="drafting" />,
    );
    const btn = screen.getByLabelText("Drafting");
    fireEvent.click(btn);
    expect(screen.queryByText("On Hold")).toBeNull();
  });

  it("calls onJiraStatusChange when Jira status selected", () => {
    const onChange = vi.fn();
    render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        onJiraStatusChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Change status"));
    expect(screen.getByText("IN PROGRESS")).toBeTruthy();
    fireEvent.click(screen.getByText("IN PROGRESS"));
    expect(onChange).toHaveBeenCalledWith("IN PROGRESS");
  });

  // BRDG-315: optimistic rows carry a `pending-<timestamp>` placeholder key until Jira returns
  // the real one. That raw GUID must never be shown; a spinner stands in for it.
  it("never renders the raw pending- placeholder key, showing a spinner instead", () => {
    render(<TicketStatusPill ticketKey="pending-1780927981071" jiraStatus="TO DO" />);
    expect(screen.queryByText(/pending-/)).toBeNull();
    expect(screen.getByLabelText("Creating story")).toBeTruthy();
  });

  it("does not open a key dropdown for a pending placeholder", () => {
    render(<TicketStatusPill ticketKey="pending-1780927981071" jiraStatus="TO DO" />);
    // There is no key link/text to click, so the dropdown actions are absent.
    expect(screen.queryByText("Copy Jira URL")).toBeNull();
  });
});

describe("TicketStatusPill hover card", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedEdits.mockReturnValue(defaultEdits());
  });
  afterEach(() => {
    act(() => { vi.runOnlyPendingTimers(); });
    vi.useRealTimers();
  });

  const fullData: TicketPillHoverData = {
    title: "Build the onboarding flow",
    storyPoints: 5,
    businessValue: 3,
    sprintId: "42",
    sprintName: "Sprint 42",
    epicKey: "VPL-100",
    epic: "Onboarding",
    assignee: { name: "Alice", initials: "AL", color: "#123456" },
    reporter: { name: "Bob", initials: "BO", color: "#654321" },
    openSubtaskCount: 2,
    totalSubtaskCount: 5,
    flagged: true,
  };

  function openCard(container: HTMLElement) {
    act(() => { fireEvent.mouseEnter(container.firstChild as Element); });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.runOnlyPendingTimers(); }); // flush the entry-animation rAF
  }

  it("shows the card with all fields after the hover delay", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    // Card is not visible before the delay elapses
    act(() => { fireEvent.mouseEnter(container.firstChild as Element); });
    expect(screen.queryByRole("tooltip")).toBeNull();

    act(() => { vi.advanceTimersByTime(400); });
    act(() => { vi.runOnlyPendingTimers(); });

    const card = screen.getByRole("tooltip");
    expect(card).toBeTruthy();
    expect(screen.getByText("Build the onboarding flow")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Sprint 42")).toBeTruthy();
    expect(screen.getByText("Onboarding")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Flagged")).toBeTruthy();
  });

  it("renders an interactive follow star in the card and toggles it (BRDG-239)", () => {
    const onToggleFollow = vi.fn();
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{ ...fullData, followed: false }}
        onToggleFollow={onToggleFollow}
      />,
    );
    openCard(container);
    const star = screen.getByRole("button", { name: "Follow ticket" });
    expect(star).toBeTruthy();
    act(() => { fireEvent.click(star); });
    expect(onToggleFollow).toHaveBeenCalledTimes(1);
  });

  it("surfaces readiness and quality signals in the card (BRDG-239)", () => {
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{ ...fullData, readiness: "ready_to_refine", qualityScore: 82 }}
      />,
    );
    openCard(container);
    expect(screen.getByText("Readiness")).toBeTruthy();
    expect(screen.getByText("Quality")).toBeTruthy();
    expect(screen.getByText("82/100")).toBeTruthy();
  });

  it("offers Run Review in the card when the ticket has no score (BRDG-239)", () => {
    const onRunReview = vi.fn();
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{ ...fullData, qualityScore: null }}
        onRunReview={onRunReview}
      />,
    );
    openCard(container);
    const btn = screen.getByRole("button", { name: /run review/i });
    act(() => { fireEvent.click(btn); });
    expect(onRunReview).toHaveBeenCalledTimes(1);
  });

  it("omits the flagged line when the ticket is not flagged", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={{ ...fullData, flagged: false }} />,
    );
    openCard(container);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.queryByText("Flagged")).toBeNull();
  });

  it("renders muted placeholders for null fields", () => {
    const data: TicketPillHoverData = {
      title: "Empty ticket",
      storyPoints: null,
      businessValue: null,
      sprintId: null,
      sprintName: null,
      epicKey: null,
      epic: null,
      assignee: null,
      reporter: null,
      openSubtaskCount: 0,
      totalSubtaskCount: 0,
      flagged: false,
    };
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={data} hoverCardEditable={false} />,
    );
    openCard(container);
    expect(screen.getByText("No sprint")).toBeTruthy();
    expect(screen.getByText("No epic")).toBeTruthy();
    expect(screen.getAllByText("Unassigned")).toHaveLength(2);
    expect(screen.getByText("None")).toBeTruthy(); // subtasks: none
  });

  it("renders pipeline and deploy badges on the metric row when that data is present", () => {
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{
          ...fullData,
          pipelineHealth: { status: "red", recentFails: 6, recentTotal: 10, lastState: "FAILED", lastCompletedAt: null },
          lastDeploy: { environment: "UAT", state: "SUCCESSFUL", completedAt: null },
        }}
      />,
    );
    openCard(container);
    const pipeline = screen.getByLabelText("Pipeline health");
    expect(pipeline.textContent).toContain("6/10");
    const deploy = screen.getByLabelText("Last deploy");
    expect(deploy.textContent).toContain("UAT");
  });

  it("shows the run total on the pipeline badge when there are no failures", () => {
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{
          ...fullData,
          pipelineHealth: { status: "green", recentFails: 0, recentTotal: 8, lastState: "SUCCESSFUL", lastCompletedAt: null },
        }}
      />,
    );
    openCard(container);
    expect(screen.getByLabelText("Pipeline health").textContent).toContain("8");
  });

  it("omits the pipeline badge when health is gray and the deploy badge when there is no deploy", () => {
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={{
          ...fullData,
          pipelineHealth: { status: "gray", recentFails: 0, recentTotal: 0, lastState: null, lastCompletedAt: null },
          lastDeploy: null,
        }}
      />,
    );
    openCard(container);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(screen.queryByLabelText("Pipeline health")).toBeNull();
    expect(screen.queryByLabelText("Last deploy")).toBeNull();
  });

  it("does not render pipeline or deploy badges when the data is absent", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    expect(screen.queryByLabelText("Pipeline health")).toBeNull();
    expect(screen.queryByLabelText("Last deploy")).toBeNull();
  });

  it("does not show the card when showHoverCard is false", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} showHoverCard={false} />,
    );
    openCard(container);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByText("Build the onboarding flow")).toBeNull();
  });

  it("does not show the card when hoverData is omitted", () => {
    const { container } = render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" />);
    openCard(container);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("hides the card after the grace period on mouse leave", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    act(() => { fireEvent.mouseLeave(container.firstChild as Element); });
    // Still open during the grace period...
    expect(screen.getByRole("tooltip")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(250); });
    // ...closed after it elapses.
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open when the pointer moves from the pill into the card", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    const card = screen.getByRole("tooltip");
    act(() => { fireEvent.mouseLeave(container.firstChild as Element); }); // leaving the pill schedules a close
    act(() => { fireEvent.mouseEnter(card); }); // entering the card cancels it
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("renders an editable Story Points picker when onStoryPointsChange is provided", () => {
    const onSp = vi.fn();
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} onStoryPointsChange={onSp} />,
    );
    openCard(container);
    act(() => { fireEvent.click(screen.getByText("5")); }); // the SP picker trigger shows its value
    act(() => { fireEvent.click(screen.getByText("8")); });
    expect(onSp).toHaveBeenCalledWith(8);
  });

  it("keeps the card open while an inline picker is open, even after leaving the card", () => {
    const onSp = vi.fn();
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} onStoryPointsChange={onSp} />,
    );
    openCard(container);
    act(() => { fireEvent.click(screen.getByText("5")); }); // opens the picker (trigger shows its value)
    act(() => { fireEvent.mouseLeave(container.firstChild as Element); });   // leave the pill
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("tooltip")).toBeTruthy(); // still open because the picker is active
  });

  it("renders a read-only score chip when editing is disabled", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} hoverCardEditable={false} />,
    );
    openCard(container);
    // No picker trigger; the static SP value is shown instead.
    expect(screen.queryByTitle("Story Points: 5")).toBeNull();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("renders editable Sprint/Epic/Assignee pickers when their handlers are provided", () => {
    const sprints = [{ id: "42", name: "Sprint 42", dateRange: "", state: "active" as const, ticketCount: 0 }];
    const { container } = render(
      <TicketStatusPill
        ticketKey="VPL-1"
        jiraStatus="TO DO"
        hoverData={fullData}
        sprints={sprints}
        onSprintChange={vi.fn()}
        onEpicChange={vi.fn()}
        onAssigneeChange={vi.fn()}
      />,
    );
    openCard(container);
    expect(screen.getByTitle("Sprint: Sprint 42")).toBeTruthy();
    expect(screen.getByTitle("Epic: Onboarding")).toBeTruthy();
    expect(screen.getByTitle("Assignee: Alice")).toBeTruthy();
  });

  it("shows the subtask count and a tooltip", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    const count = screen.getByText("2/5");
    expect(count).toBeTruthy();
    // Tooltip content appears after hovering the count.
    act(() => { fireEvent.mouseEnter(count.parentElement as Element); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText("2 open of 5 subtasks")).toBeTruthy();
  });

  it("shows Creator read-only even when assignee is editable", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} onAssigneeChange={vi.fn()} />,
    );
    openCard(container);
    // Creator has no editor (Jira reporters are immutable); the name shows but no picker title.
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.queryByTitle("Assignee: Bob")).toBeNull();
  });

  it("still opens the key dropdown on click when hoverData is present", () => {
    render(<TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />);
    fireEvent.click(screen.getByText("VPL-1"));
    expect(screen.getByText("Copy Jira URL")).toBeTruthy();
  });

  // BRDG-276: the card is editable by default, with no per-usage wiring.
  it("is editable by default: SP edits call the default handler", () => {
    const onSp = vi.fn();
    mockedEdits.mockReturnValue(defaultEdits({ onStoryPointsChange: onSp }));
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    act(() => { fireEvent.click(screen.getByText("5")); }); // SP picker trigger
    act(() => { fireEvent.click(screen.getByText("8")); });
    expect(onSp).toHaveBeenCalledWith(8);
  });

  it("is editable by default: shows Sprint/Epic/Assignee pickers without explicit handlers", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} />,
    );
    openCard(container);
    expect(screen.getByTitle("Sprint: Sprint 42")).toBeTruthy();
    expect(screen.getByTitle("Epic: Onboarding")).toBeTruthy();
    expect(screen.getByTitle("Assignee: Alice")).toBeTruthy();
  });

  it("explicit handlers win over the default editors", () => {
    const explicit = vi.fn();
    const fallbackSp = vi.fn();
    mockedEdits.mockReturnValue(defaultEdits({ onStoryPointsChange: fallbackSp }));
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} onStoryPointsChange={explicit} />,
    );
    openCard(container);
    act(() => { fireEvent.click(screen.getByText("5")); });
    act(() => { fireEvent.click(screen.getByText("8")); });
    expect(explicit).toHaveBeenCalledWith(8);
    expect(fallbackSp).not.toHaveBeenCalled();
  });

  it("renders read-only (no pickers) when hoverCardEditable is false", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} hoverCardEditable={false} />,
    );
    openCard(container);
    expect(screen.queryByTitle("Sprint: Sprint 42")).toBeNull();
    expect(screen.queryByTitle("Assignee: Alice")).toBeNull();
    expect(screen.getByText("Sprint 42")).toBeTruthy(); // plain text value instead
  });

  it("stays read-only for removed-from-Jira tickets even with editing on", () => {
    const { container } = render(
      <TicketStatusPill ticketKey="VPL-1" jiraStatus="TO DO" hoverData={fullData} removedFromJira />,
    );
    openCard(container);
    expect(screen.queryByTitle("Sprint: Sprint 42")).toBeNull();
    expect(screen.queryByTitle("Story Points: 5")).toBeNull();
  });
});
