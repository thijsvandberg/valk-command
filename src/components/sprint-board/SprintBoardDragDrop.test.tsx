import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "./SprintBoardDragDrop";
import type { Sprint } from "@/types/ticket";

vi.mock("lucide-react", () => ({
  ArrowRight: (props: Record<string, unknown>) => <span data-testid="arrow-right" {...props} />,
}));

// Capture every droppable id registered during a render so tests can assert which
// sprint the backlog tile actually targets.
const { droppableIds } = vi.hoisted(() => ({ droppableIds: [] as string[] }));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: ({ id }: { id: string }) => {
    droppableIds.push(id);
    return { setNodeRef: vi.fn(), isOver: false };
  },
  pointerWithin: vi.fn(() => []),
  closestCenter: vi.fn(() => [{ id: "ticket-1" }]),
}));

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: "1",
    name: "Sprint 1",
    state: "active",
    dateRange: "Apr 1 - Apr 14",
    ticketCount: 5,
    ...overrides,
  };
}

describe("SprintDropZoneBar", () => {
  // "BT: Backlog" is a real Jira sprint with a numeric id; "__backlog__" is the
  // generic sprint-less project backlog. The drop tile must point at the real sprint.
  const sprints = [
    makeSprint({ id: "s1", name: "Sprint 1" }),
    makeSprint({ id: "s2", name: "Sprint 2" }),
    makeSprint({ id: "s3", name: "Sprint 3" }),
    makeSprint({ id: "628", name: "BT: Backlog", state: "backlog" }),
    makeSprint({ id: "__backlog__", name: "Backlog", state: "backlog" }),
  ];

  beforeEach(() => {
    droppableIds.length = 0;
  });

  it("keeps the bar chrome: renders the All pill, no 'Move to' label", () => {
    render(<SprintDropZoneBar sprints={sprints} pillSlotSprints={["s1", "s2", "s3"]} activeSprintId="s1" allActive={false} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.queryByText("Move to")).not.toBeInTheDocument();
  });

  it("renders the backlog target as 'BT: Backlog' in the Backlogs slot", () => {
    render(<SprintDropZoneBar sprints={sprints} pillSlotSprints={["s1", "s2"]} activeSprintId="s1" allActive={false} />);
    expect(screen.getByText("BT: Backlog")).toBeInTheDocument();
  });

  it("targets the real BT: Backlog sprint id, not the generic __backlog__", () => {
    render(<SprintDropZoneBar sprints={sprints} pillSlotSprints={["s1", "s2"]} activeSprintId="s1" allActive={false} />);
    expect(droppableIds).toContain("sprint-slot:628");
    expect(droppableIds).not.toContain("sprint-slot:__backlog__");
  });

  it("makes pinned non-active sprints + backlog drop tiles, the active sprint a plain pill", () => {
    render(<SprintDropZoneBar sprints={sprints} pillSlotSprints={["s1", "s2", "s3"]} activeSprintId="s1" allActive={false} />);
    // s2, s3 and BT: Backlog each render an arrow cue (drop tiles); s1 is plain.
    expect(screen.getAllByTestId("arrow-right")).toHaveLength(3);
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    expect(screen.getByText("Sprint 3")).toBeInTheDocument();
  });

  it("renders the backlog as a plain pill when the backlog sprint is the active view", () => {
    render(<SprintDropZoneBar sprints={sprints} pillSlotSprints={["s1", "s2"]} activeSprintId="628" allActive={false} />);
    expect(screen.getByText("BT: Backlog")).toBeInTheDocument();
    // Only s1 and s2 are drop tiles; BT: Backlog is plain (no arrow).
    expect(screen.getAllByTestId("arrow-right")).toHaveLength(2);
  });
});

describe("snapToPointer", () => {
  it("returns original transform when no activatorEvent", () => {
    const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const result = snapToPointer({ activatorEvent: null, draggingNodeRect: null, transform, containerNodeRect: null, scrollableAncestors: [], scrollableAncestorRects: [], windowRect: null, over: null, active: null, activeNodeRect: null, overlayNodeRect: null });
    expect(result).toEqual(transform);
  });

  it("offsets transform by cursor position when activatorEvent present", () => {
    const transform = { x: 10, y: 20, scaleX: 1, scaleY: 1 };
    const event = new MouseEvent("pointerdown", { clientX: 100, clientY: 200 });
    const rect = { left: 50, top: 100, width: 200, height: 40, right: 250, bottom: 140, x: 50, y: 100, toJSON: () => {} };
    const result = snapToPointer({ activatorEvent: event, draggingNodeRect: rect, transform, containerNodeRect: null, scrollableAncestors: [], scrollableAncestorRects: [], windowRect: null, over: null, active: null, activeNodeRect: null, overlayNodeRect: null });
    expect(result.x).toBe(10 + 100 - 50 + 8);
    expect(result.y).toBe(20 + 200 - 100 + 8);
  });
});

describe("boardCollisionDetection", () => {
  it("falls back to closestCenter for non-zone containers", () => {
    const result = boardCollisionDetection({
      active: { id: "ticket-dragging", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
      collisionRect: { top: 0, left: 0, width: 100, height: 40, right: 100, bottom: 40 },
      droppableContainers: [
        { id: "ticket-1", key: "ticket-1", data: { current: {} }, rect: { current: null }, disabled: false, node: { current: null } },
      ],
      droppableRects: new Map(),
      pointerCoordinates: null,
    });
    // closestCenter mock returns [{ id: "ticket-1" }]
    expect(result).toEqual([{ id: "ticket-1" }]);
  });
});
