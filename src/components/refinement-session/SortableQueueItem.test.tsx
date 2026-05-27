import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SortableQueueItem } from "./SortableQueueItem";
import type { Ticket, TicketEditState } from "@/types/ticket";

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

function makeTicket(editState: TicketEditState = "clean"): Ticket {
  return {
    key: "VPL-1",
    title: "Queue ticket",
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus: "TO DO",
    storyPoints: 3,
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

describe("SortableQueueItem edit state badges", () => {
  it("shows conflict dot when editState is 'conflict'", () => {
    const { container } = render(
      <SortableQueueItem ticket={makeTicket("conflict")} onRemove={() => {}} />,
    );
    const smallDots = container.querySelectorAll(".h-1\\.5.w-1\\.5.rounded-full");
    expect(smallDots.length).toBe(1);
  });

  it("shows dot when editState is 'local_edits'", () => {
    const { container } = render(
      <SortableQueueItem ticket={makeTicket("local_edits")} onRemove={() => {}} />,
    );
    const smallDots = container.querySelectorAll(".h-1\\.5.w-1\\.5.rounded-full");
    expect(smallDots.length).toBe(1);
  });

  it("shows dot when editState is 'draft'", () => {
    const { container } = render(
      <SortableQueueItem ticket={makeTicket("draft")} onRemove={() => {}} />,
    );
    const smallDots = container.querySelectorAll(".h-1\\.5.w-1\\.5.rounded-full");
    expect(smallDots.length).toBe(1);
  });

  it("shows no dot when editState is 'clean'", () => {
    const { container } = render(
      <SortableQueueItem ticket={makeTicket("clean")} onRemove={() => {}} />,
    );
    const smallDots = container.querySelectorAll(".h-1\\.5.w-1\\.5.rounded-full");
    expect(smallDots.length).toBe(0);
  });
});
