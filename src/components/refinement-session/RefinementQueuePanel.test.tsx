import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RefinementQueuePanel } from "./RefinementQueuePanel";
import type { Ticket, TicketEditState } from "@/types/ticket";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

function makeTicket(key: string, editState: TicketEditState = "clean"): Ticket {
  return {
    key,
    title: `Ticket ${key}`,
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

function makeQueueHook(tickets: Ticket[]) {
  return {
    queue: tickets.map((t) => t.key),
    queueTickets: tickets,
    allTicketMap: new Map(tickets.map((t) => [t.key, t])),
    toggleTicket: vi.fn(),
    handleToggleReadyToRefine: vi.fn(),
    removeFromQueue: vi.fn(),
    updateQueue: vi.fn(),
    sensors: [],
    handleDragEnd: vi.fn(),
    localQueue: [],
    setLocalQueue: vi.fn(),
    flushPersistTimer: vi.fn(),
    readyCount: 0,
    allReadySelected: false,
  };
}

function makeBulk() {
  return {
    bulkSuggestMenuOpen: false,
    setBulkSuggestMenuOpen: vi.fn(),
    bulkSuggestRunning: false,
    bulkSuggestVisible: false,
    setBulkSuggestVisible: vi.fn(),
    handleBulkSuggest: vi.fn(),
    handleCopyStories: vi.fn(),
    bulkSuggestConvId: null,
    bulkSuggestPanelCollapsed: false,
    setBulkSuggestPanelCollapsed: vi.fn(),
    copyToast: false,
    suggestionCounts: {},
  };
}

describe("RefinementQueuePanel conflict count", () => {
  it("shows conflict count when queue has conflicts", () => {
    const tickets = [
      makeTicket("VPL-1", "conflict"),
      makeTicket("VPL-2", "conflict"),
      makeTicket("VPL-3", "clean"),
    ];
    render(
      <RefinementQueuePanel
        activeSession={null}
        queueHook={makeQueueHook(tickets)}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("2 conflicts")).toBeInTheDocument();
  });

  it("shows no alert banner when all tickets are clean", () => {
    const tickets = [
      makeTicket("VPL-1", "clean"),
      makeTicket("VPL-2", "clean"),
    ];
    render(
      <RefinementQueuePanel
        activeSession={null}
        queueHook={makeQueueHook(tickets)}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.queryByText(/conflict/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/local edit/i)).not.toBeInTheDocument();
  });

  it("shows local edits count for draft/local_edits tickets", () => {
    const tickets = [
      makeTicket("VPL-1", "draft"),
      makeTicket("VPL-2", "local_edits"),
      makeTicket("VPL-3", "clean"),
    ];
    render(
      <RefinementQueuePanel
        activeSession={null}
        queueHook={makeQueueHook(tickets)}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("2 local edits")).toBeInTheDocument();
  });

  it("shows combined counts when both conflicts and local edits exist", () => {
    const tickets = [
      makeTicket("VPL-1", "conflict"),
      makeTicket("VPL-2", "draft"),
    ];
    render(
      <RefinementQueuePanel
        activeSession={null}
        queueHook={makeQueueHook(tickets)}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("1 conflict, 1 local edit")).toBeInTheDocument();
  });

  it("shows singular 'conflict' for exactly one conflict", () => {
    const tickets = [makeTicket("VPL-1", "conflict")];
    render(
      <RefinementQueuePanel
        activeSession={null}
        queueHook={makeQueueHook(tickets)}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("1 conflict")).toBeInTheDocument();
  });
});

function makeSession(status: "draft" | "in_progress" | "completed") {
  return {
    id: "session-abc",
    name: "Refinement 2026-06-02",
    status,
    ticketKeys: ["VPL-1"],
    ticketCount: 1,
    currentIndex: 0,
    generalComment: null,
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
  };
}

describe("RefinementQueuePanel primary action", () => {
  it("labels the button 'Start Refinement' for a fresh session", () => {
    render(
      <RefinementQueuePanel
        activeSession={makeSession("draft")}
        queueHook={makeQueueHook([makeTicket("VPL-1")])}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("Start Refinement")).toBeInTheDocument();
  });

  it("labels the button 'Continue Refinement' for an in-progress session", () => {
    render(
      <RefinementQueuePanel
        activeSession={makeSession("in_progress")}
        queueHook={makeQueueHook([makeTicket("VPL-1")])}
        bulk={makeBulk()}
        otherSessions={[]}
        canStart={true}
        onMoveToSession={vi.fn()}
        onBeginRefinement={vi.fn()}
        onSaveAsSession={vi.fn()}
      />,
    );
    expect(screen.getByText("Continue Refinement")).toBeInTheDocument();
    expect(screen.queryByText("Start Refinement")).not.toBeInTheDocument();
  });
});
