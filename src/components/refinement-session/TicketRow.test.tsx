import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketRow } from "./TicketRow";
import type { Ticket, TicketEditState, Sprint } from "@/types/ticket";
import type { TicketPillHoverData } from "@/components/shared/TicketStatusPill";

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey, hoverData }: { ticketKey: string; hoverData: TicketPillHoverData }) => (
    <span data-testid="ticket-status-pill" data-sprint-id={hoverData.sprintId ?? ""}>
      {ticketKey}
    </span>
  ),
}));

function makeTicket(editState: TicketEditState = "clean"): Ticket {
  return {
    key: "VPL-1",
    title: "Test ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: null,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState,
    notes: "",
  };
}

const noop = () => {};

describe("TicketRow edit state badges", () => {
  it("shows conflict dot when editState is 'conflict'", () => {
    const { container } = render(
      <TicketRow ticket={makeTicket("conflict")} selected={false} onToggle={noop} sprintName={null} index={0} />,
    );
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows dot when editState is 'local_edits'", () => {
    const { container } = render(
      <TicketRow ticket={makeTicket("local_edits")} selected={false} onToggle={noop} sprintName={null} index={0} />,
    );
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows dot when editState is 'draft'", () => {
    const { container } = render(
      <TicketRow ticket={makeTicket("draft")} selected={false} onToggle={noop} sprintName={null} index={0} />,
    );
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots.length).toBeGreaterThan(0);
  });

  it("shows no dot when editState is 'clean'", () => {
    const { container } = render(
      <TicketRow ticket={makeTicket("clean")} selected={false} onToggle={noop} sprintName={null} index={0} />,
    );
    // The only rounded-full element should be the checkbox border (rounded, not rounded-full)
    // EditStateDot renders a span with h-1.5 w-1.5 rounded-full
    const smallDots = container.querySelectorAll(".h-1\\.5.w-1\\.5.rounded-full");
    expect(smallDots.length).toBe(0);
  });
});

describe("TicketRow hover-card sprint", () => {
  const sprints: Sprint[] = [
    { id: "139", name: "BT: 139", dateRange: "", state: "active", ticketCount: 0, startDate: null, endDate: null, goal: null },
  ];

  it("passes the ticket's sprint id through so the picker can resolve the active sprint", () => {
    const ticket = { ...makeTicket("clean"), sprintId: "139" };
    render(
      <TicketRow ticket={ticket} selected={false} onToggle={noop} sprintName="BT: 139" index={0} sprints={sprints} />,
    );
    // sprintId must be the sprint id (matched by the picker via String(s.id)), not
    // a name lookup that would fail and render "None" while a sprint exists.
    expect(screen.getByTestId("ticket-status-pill")).toHaveAttribute("data-sprint-id", "139");
  });

  it("leaves the sprint id null when the ticket has no sprint", () => {
    render(
      <TicketRow ticket={makeTicket("clean")} selected={false} onToggle={noop} sprintName={null} index={0} sprints={sprints} />,
    );
    expect(screen.getByTestId("ticket-status-pill")).toHaveAttribute("data-sprint-id", "");
  });
});
