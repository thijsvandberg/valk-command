import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";
import { DEFAULT_VISIBLE_TAGS } from "./filter-bar-types";

// BRDG-452: past GROUPED_VIRTUALIZE_THRESHOLD total expanded rows, each expanded group
// windows its rows through its own virtualizer; below it the grouped path renders plainly.

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    Sheet: stub("sheet"),
    Inbox: stub("inbox"),
    Plus: stub("plus"),
    ChevronDown: stub("chevron-down"),
    CheckCheck: stub("check-check"),
  };
});

const { useDroppableMock, virtualizerState } = vi.hoisted(() => ({
  useDroppableMock: vi.fn((_args: { id: string }) => ({ setNodeRef: vi.fn(), isOver: false })),
  virtualizerState: {
    // Every group virtualizer "windows" the first N of its items.
    windowSize: 3,
    scrollOffset: 0,
    viewportHeight: 800,
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: useDroppableMock,
  DragOverlay: () => null,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; scrollMargin?: number }) => {
    const n = Math.min(virtualizerState.windowSize, opts.count);
    const margin = opts.scrollMargin ?? 0;
    return {
      getVirtualItems: () =>
        Array.from({ length: n }, (_, i) => ({
          index: i,
          key: i,
          start: margin + i * 44,
          end: margin + (i + 1) * 44,
          size: 44,
        })),
      getTotalSize: () => opts.count * 44,
      measureElement: vi.fn(),
      scrollOffset: virtualizerState.scrollOffset,
      scrollRect: { width: 1000, height: virtualizerState.viewportHeight },
    };
  },
}));

vi.mock("./BoardRow", () => ({
  BoardRow: ({ ticket }: { ticket: Ticket }) => (
    <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>
  ),
  SortableBoardRow: ({ ticket }: { ticket: Ticket }) => (
    <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>
  ),
}));

vi.mock("@/hooks/usePipelines", () => ({
  useFollowedTickets: () => ({ data: [] }),
  useFollowTicket: () => ({ follow: vi.fn(), unfollow: vi.fn() }),
  useLastDeployed: () => ({ map: {} }),
  usePipelineHealth: () => ({ map: {} }),
}));

vi.mock("@/components/sprint-board/TicketTableCells", () => ({
  POStatusCell: () => null,
  QualityBadge: () => null,
  POStatusIcon: () => null,
  EditStateDot: () => null,
  getJiraUrl: () => "#",
}));

vi.mock("@/components/sprint-board/GroupStatBar", () => ({
  GroupStatBar: ({ label }: { label: string }) => <div data-testid={`group-header-${label}`} />,
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: () => null,
}));

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
}));

function makeTicket(key: string, jiraStatus: Ticket["jiraStatus"] = "TO DO"): Ticket {
  return {
    key,
    title: key,
    type: "story",
    epic: null,
    epicKey: null,
    jiraStatus,
    storyPoints: 3,
    assignee: null,
    flagged: false,
    readiness: null,
    poStatus: null,
    qualityScore: null,
    businessValue: null,
    editState: "clean",
    notes: "",
  };
}

function makeGroupTickets(prefix: string, count: number): Ticket[] {
  return Array.from({ length: count }, (_, i) => makeTicket(`${prefix}-${i + 1}`));
}

function baseProps(tickets: Ticket[]) {
  return {
    tickets,
    selectedTicket: null,
    onSelectTicket: vi.fn(),
    visibleTags: new Set<InlineTagId>(DEFAULT_VISIBLE_TAGS),
    checkedTickets: new Set<string>(),
    focusedTicketIdx: -1,
    someChecked: false,
    allChecked: false,
    onToggleCheck: vi.fn(),
    onRangeCheck: vi.fn(),
    onToggleAll: vi.fn(),
    onPoStatusChange: vi.fn(),
    onTableKeyDown: vi.fn(),
    poStatuses: {},
    readinessMap: {},
    sortField: "rank" as const,
    sortDir: "asc" as const,
    groupBy: "sprint" as const,
    externalDnd: true,
  };
}

const mountedRowKeys = () =>
  screen.queryAllByTestId(/^row-/).map((el) => el.getAttribute("data-testid"));

beforeEach(() => {
  useDroppableMock.mockClear();
  virtualizerState.windowSize = 3;
  virtualizerState.scrollOffset = 0;
  virtualizerState.viewportHeight = 800;
});

describe("TicketTable grouped virtualization (BRDG-452)", () => {
  it("windows each expanded group past the total-row threshold", () => {
    const a = makeGroupTickets("A", 40);
    const b = makeGroupTickets("B", 40);
    const c = makeGroupTickets("C", 40);
    const groups = [
      { key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 },
      { key: "2", label: "Sprint 2", tickets: b, sortOrder: 1 },
      { key: "3", label: "Sprint 3", tickets: c, sortOrder: 2 },
    ];
    render(<TicketTable {...baseProps([...a, ...b, ...c])} groups={groups} />);
    // 120 total rows, but only the mocked window (3) of each group mounts.
    expect(mountedRowKeys()).toEqual([
      "row-A-1", "row-A-2", "row-A-3",
      "row-B-1", "row-B-2", "row-B-3",
      "row-C-1", "row-C-2", "row-C-3",
    ]);
    expect(screen.queryByTestId("row-A-10")).toBeNull();
  });

  it("renders all rows plainly below the threshold", () => {
    const a = makeGroupTickets("A", 10);
    const b = makeGroupTickets("B", 10);
    const groups = [
      { key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 },
      { key: "2", label: "Sprint 2", tickets: b, sortOrder: 1 },
    ];
    render(<TicketTable {...baseProps([...a, ...b])} groups={groups} />);
    expect(mountedRowKeys()).toHaveLength(20);
    expect(screen.getByTestId("row-B-10")).toBeInTheDocument();
  });

  it("counts only EXPANDED rows toward the threshold (collapsing can turn windowing off)", () => {
    const a = makeGroupTickets("A", 60);
    const b = makeGroupTickets("B", 60);
    const groups = [
      { key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 },
      { key: "2", label: "Sprint 2", tickets: b, sortOrder: 1 },
    ];
    render(
      <TicketTable
        {...baseProps([...a, ...b])}
        groups={groups}
        collapsedGroups={new Set(["2"])}
      />,
    );
    // 60 expanded rows <= 100: the remaining group renders every row, none from the collapsed one.
    expect(mountedRowKeys()).toHaveLength(60);
    expect(screen.getByTestId("row-A-60")).toBeInTheDocument();
    expect(screen.queryByTestId("row-B-1")).toBeNull();
  });

  it("renders the finished-work divider as a windowed item", () => {
    const active = makeGroupTickets("A", 100);
    const done = [makeTicket("A-DONE-1", "DONE"), makeTicket("A-DONE-2", "DONE")];
    const tickets = [...active, ...done];
    const groups = [{ key: "1", label: "Sprint 1", tickets, sortOrder: 0 }];
    virtualizerState.windowSize = 200; // window covers all items
    render(<TicketTable {...baseProps(tickets)} groups={groups} sprints={[{ id: "1", name: "Sprint 1", state: "active" }] as never} />);
    expect(screen.getByText("finished work")).toBeInTheDocument();
    expect(screen.getByTestId("row-A-DONE-2")).toBeInTheDocument();
  });

  it("mounts no rows for a group far outside the viewport (spacer only)", () => {
    const a = makeGroupTickets("A", 120);
    const groups = [{ key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 }];
    virtualizerState.scrollOffset = 50000; // group window ends far above the viewport
    const { container } = render(<TicketTable {...baseProps(a)} groups={groups} />);
    expect(mountedRowKeys()).toHaveLength(0);
    // The group keeps its full height through a single spacer row.
    const spacer = container.querySelector("tbody tr td[style]");
    expect(spacer?.getAttribute("style")).toContain("height");
  });

  it("keeps the empty-group drop zone outside the window", () => {
    const a = makeGroupTickets("A", 120);
    const groups = [
      { key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 },
      { key: "2", label: "Sprint 2", tickets: [], sortOrder: 1 },
    ];
    render(<TicketTable {...baseProps(a)} groups={groups} />);
    const droppableIds = useDroppableMock.mock.calls.map((c) => c[0].id);
    expect(droppableIds).toContain("group-zone:2");
  });

  it("marks the table container as the groups root so per-group scrollMargins can re-measure", () => {
    // VirtualizedGroupRows resolves this ancestor via closest() at layout-effect time; a
    // ref prop is NOT attached yet at that moment on first mount in production (no
    // StrictMode re-run), which silently broke offset re-measuring (half-empty cards).
    const a = makeGroupTickets("A", 120);
    const groups = [{ key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 }];
    const { container } = render(<TicketTable {...baseProps(a)} groups={groups} />);
    expect(container.querySelector("[data-board-groups-root]")).not.toBeNull();
  });

  it("registers every expanded group header as a drop target, collapsed ones as zones (BRDG-452)", () => {
    const a = makeGroupTickets("A", 120);
    const b = makeGroupTickets("B", 10);
    const groups = [
      { key: "1", label: "Sprint 1", tickets: a, sortOrder: 0 },
      { key: "2", label: "Sprint 2", tickets: b, sortOrder: 1 },
    ];
    render(
      <TicketTable
        {...baseProps([...a, ...b])}
        groups={groups}
        collapsedGroups={new Set(["2"])}
      />,
    );
    const droppableIds = useDroppableMock.mock.calls.map((c) => c[0].id);
    expect(droppableIds).toContain("group-header:1");
    // A collapsed group keeps the whole-card zone target instead of a header target.
    expect(droppableIds).toContain("group-zone:2");
    expect(droppableIds).not.toContain("group-header:2");
  });
});
