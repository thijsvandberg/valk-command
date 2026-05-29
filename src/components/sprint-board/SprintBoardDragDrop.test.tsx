import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintDropZoneBar, snapToPointer, boardCollisionDetection } from "./SprintBoardDragDrop";
import type { Sprint } from "@/types/ticket";

vi.mock("lucide-react", () => ({
  ArrowRight: (props: Record<string, unknown>) => <span data-testid="arrow-right" {...props} />,
}));

vi.mock("@dnd-kit/core", () => ({
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
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
  const sprints = [
    makeSprint({ id: "s1", name: "Sprint 1" }),
    makeSprint({ id: "s2", name: "Sprint 2" }),
    makeSprint({ id: "s3", name: "Sprint 3" }),
    makeSprint({ id: "__backlog__", name: "Backlog" }),
  ];

  it("renders 'Move to' label", () => {
    render(<SprintDropZoneBar sprints={sprints} slotSprints={["s1", "s2", "s3"]} activeSprintId="s1" />);
    expect(screen.getByText("Move to")).toBeInTheDocument();
  });

  it("excludes the active sprint from drop targets", () => {
    render(<SprintDropZoneBar sprints={sprints} slotSprints={["s1", "s2", "s3"]} activeSprintId="s1" />);
    expect(screen.getByText("Sprint 2")).toBeInTheDocument();
    expect(screen.getByText("Sprint 3")).toBeInTheDocument();
    expect(screen.queryByText("Sprint 1")).not.toBeInTheDocument();
  });

  it("shows backlog target when not active and not in slot list", () => {
    render(<SprintDropZoneBar sprints={sprints} slotSprints={["s1", "s2"]} activeSprintId="s1" />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
  });

  it("hides backlog when it is the active sprint", () => {
    render(<SprintDropZoneBar sprints={sprints} slotSprints={["s1", "s2"]} activeSprintId="__backlog__" />);
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
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
