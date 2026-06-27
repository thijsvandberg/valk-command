import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";
import { DEFAULT_VISIBLE_TAGS } from "./filter-bar-types";

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

const { useDroppableMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn((_args: { id: string }) => ({ setNodeRef: vi.fn(), isOver: false })),
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
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
  }),
}));

// The headerless board renders a forked flex row (BoardRow), not the legacy TicketRow.
vi.mock("./BoardRow", () => ({
  BoardRow: ({ ticket, showStoryWriterLink }: { ticket: Ticket; showStoryWriterLink?: boolean }) => (
    <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}{showStoryWriterLink && <span data-testid={`sw-link-${ticket.key}`} />}</td></tr>
  ),
  SortableBoardRow: ({ ticket, showStoryWriterLink }: { ticket: Ticket; showStoryWriterLink?: boolean }) => (
    <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}{showStoryWriterLink && <span data-testid={`sw-link-${ticket.key}`} />}</td></tr>
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
  GroupStatBar: () => null,
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({
  IssueTypeIcon: () => null,
}));

vi.mock("@/components/shared/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty">{title}</div>,
}));

function makeTicket(key: string, title: string, jiraStatus: Ticket["jiraStatus"] = "TO DO"): Ticket {
  return {
    key,
    title,
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

describe("TicketTable (headerless, BRDG-239)", () => {
  const defaultProps = {
    tickets: [makeTicket("T-1", "First ticket"), makeTicket("T-2", "Second ticket")],
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
  };

  it("renders ticket rows for each ticket", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.getByTestId("row-T-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-T-2")).toBeInTheDocument();
  });

  it("flags only the rows whose key is in freshlyCreatedKeys (BRDG-395)", () => {
    render(<TicketTable {...defaultProps} freshlyCreatedKeys={new Set(["T-2"])} />);
    expect(screen.queryByTestId("sw-link-T-1")).toBeNull();
    expect(screen.getByTestId("sw-link-T-2")).toBeInTheDocument();
  });

  it("flags no rows when freshlyCreatedKeys is absent (BRDG-395)", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.queryByTestId("sw-link-T-1")).toBeNull();
    expect(screen.queryByTestId("sw-link-T-2")).toBeNull();
  });

  it("renders no column headers", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByText("Title")).toBeNull();
  });

  it("shows empty state when no tickets", () => {
    render(<TicketTable {...defaultProps} tickets={[]} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("uses the default empty copy when no search is active (BRDG-345)", () => {
    render(<TicketTable {...defaultProps} tickets={[]} />);
    expect(screen.getByText("No tickets in this sprint")).toBeInTheDocument();
  });

  it("swaps to a search-specific empty copy when a search is active (BRDG-345)", () => {
    render(<TicketTable {...defaultProps} tickets={[]} searchActive />);
    expect(screen.getByText("No tickets match your search")).toBeInTheDocument();
    expect(screen.queryByText("No tickets in this sprint")).not.toBeInTheDocument();
  });
});

describe("TicketTable flat create composer (BRDG-315)", () => {
  const flatProps = {
    ...{
      tickets: [
        makeTicket("T-1", "First", "TO DO"),
        makeTicket("T-2", "Second", "TO DO"),
        makeTicket("T-3", "Finished", "DONE"),
      ],
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
      onCreateTicket: vi.fn(),
      flatCreateTarget: { sprintId: "1" },
    },
  };

  const COMPOSER_PLACEHOLDER = "Create story in this sprint...";

  it("hides the composer by default (until the header + opens it)", () => {
    render(<TicketTable {...flatProps} />);
    expect(screen.queryByPlaceholderText(COMPOSER_PLACEHOLDER)).toBeNull();
  });

  it("shows the composer when flatComposerOpen is true", () => {
    render(<TicketTable {...flatProps} flatComposerOpen />);
    expect(screen.getByPlaceholderText(COMPOSER_PLACEHOLDER)).toBeInTheDocument();
  });

  it("renders the composer above the trailing done/deprecated block", () => {
    const { container } = render(<TicketTable {...flatProps} flatComposerOpen />);
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const composerIdx = rows.findIndex((r) => r.querySelector(`input[placeholder="${COMPOSER_PLACEHOLDER}"]`));
    const t2Idx = rows.findIndex((r) => r.getAttribute("data-testid") === "row-T-2");
    const doneIdx = rows.findIndex((r) => r.getAttribute("data-testid") === "row-T-3");
    expect(composerIdx).toBeGreaterThan(t2Idx);
    expect(composerIdx).toBeLessThan(doneIdx);
  });

  it("renders the composer at the end when there is no trailing done/dep block", () => {
    const tickets = [makeTicket("T-1", "First", "TO DO"), makeTicket("T-2", "Second", "IN PROGRESS")];
    const { container } = render(<TicketTable {...flatProps} tickets={tickets} flatComposerOpen />);
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const composerIdx = rows.findIndex((r) => r.querySelector(`input[placeholder="${COMPOSER_PLACEHOLDER}"]`));
    const lastRowIdx = rows.findIndex((r) => r.getAttribute("data-testid") === "row-T-2");
    expect(composerIdx).toBeGreaterThan(lastRowIdx);
  });

  // BRDG-371: a backlog flat view lands the create row at the TOP.
  const BACKLOG_PLACEHOLDER = "Create story in the backlog...";

  it("renders the composer at the TOP for the generic backlog", () => {
    const { container } = render(
      <TicketTable {...flatProps} flatCreateTarget={{ sprintId: null }} flatComposerOpen />,
    );
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    const composerIdx = rows.findIndex((r) => r.querySelector(`input[placeholder="${BACKLOG_PLACEHOLDER}"]`));
    const firstRowIdx = rows.findIndex((r) => r.getAttribute("data-testid") === "row-T-1");
    expect(composerIdx).toBeGreaterThanOrEqual(0);
    expect(composerIdx).toBeLessThan(firstRowIdx);
  });

  it("renders the composer at the TOP for a named backlog sprint, with backlog wording", () => {
    const { container } = render(
      <TicketTable
        {...flatProps}
        flatCreateTarget={{ sprintId: "9" }}
        sprintNameMap={{ "9": "BT: Backlog" }}
        flatComposerOpen
      />,
    );
    const rows = Array.from(container.querySelectorAll("tbody tr"));
    // A named backlog flat view uses the backlog wording, not "in this sprint".
    const composerIdx = rows.findIndex((r) => r.querySelector(`input[placeholder="${BACKLOG_PLACEHOLDER}"]`));
    const firstRowIdx = rows.findIndex((r) => r.getAttribute("data-testid") === "row-T-1");
    expect(composerIdx).toBeGreaterThanOrEqual(0);
    expect(composerIdx).toBeLessThan(firstRowIdx);
  });
});

describe("TicketTable collapsed-group drop target", () => {
  const groups = [
    { key: "1", label: "Sprint 1", tickets: [makeTicket("T-1", "First")], sortOrder: 0 },
    { key: "2", label: "Sprint 2", tickets: [makeTicket("T-2", "Second")], sortOrder: 1 },
  ];
  const groupedProps = {
    tickets: [makeTicket("T-1", "First"), makeTicket("T-2", "Second")],
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
    groups,
    groupBy: "sprint" as const,
    externalDnd: true,
  };

  const droppableIds = () => useDroppableMock.mock.calls.map((c) => c[0].id);

  beforeEach(() => useDroppableMock.mockClear());

  it("registers a group-zone droppable for a collapsed group (even when it has tickets)", () => {
    render(<TicketTable {...groupedProps} collapsedGroups={new Set(["2"])} />);
    expect(droppableIds()).toContain("group-zone:2");
  });

  it("does not register the body drop zone for an expanded group with tickets", () => {
    // Expanded, non-empty groups have no DroppableGroupZone; only the collapsed card is a target.
    render(<TicketTable {...groupedProps} collapsedGroups={new Set()} />);
    expect(droppableIds()).not.toContain("group-zone:1");
    expect(droppableIds()).not.toContain("group-zone:2");
  });

  it("does not register a collapsed drop target when external drag is off", () => {
    render(<TicketTable {...groupedProps} externalDnd={false} collapsedGroups={new Set(["2"])} />);
    expect(droppableIds()).not.toContain("group-zone:2");
  });
});

// Note: the grouped create-composer position (above the rows for a backlog group) is
// not unit-tested here because this file stubs GroupStatBar (and thus the "+" trigger)
// to null, so the grouped composer can't be opened. The flat-composer tests above cover
// the backlog-top placement, and the grouped path uses the same isBacklogGroup predicate.
