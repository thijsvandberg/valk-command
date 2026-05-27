import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketRow } from "./TicketRow";
import type { Ticket, TicketEditState } from "@/types/ticket";

vi.mock("@/components/shared/TicketStatusPill", () => ({
  TicketStatusPill: ({ ticketKey }: { ticketKey: string }) => (
    <span data-testid="ticket-status-pill">{ticketKey}</span>
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
