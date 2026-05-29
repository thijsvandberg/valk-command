import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";
import type { ColumnId } from "./filter-bar-types";

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return { ArrowUp: stub("arrow-up"), ArrowDown: stub("arrow-down"), ArrowUpDown: stub("arrow-updown"), Sheet: stub("sheet") };
});

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
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

vi.mock("./TicketRow", () => ({
  TicketRow: ({ ticket }: { ticket: Ticket }) => <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>,
  SortableTicketRow: ({ ticket }: { ticket: Ticket }) => <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>,
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
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty">{message}</div>,
}));

vi.mock("@/components/shared/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useColumnWidths", () => ({
  DEFAULT_COLUMN_WIDTHS: {},
}));

function makeTicket(key: string, title: string): Ticket {
  return {
    key,
    title,
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
    editState: "clean",
    notes: "",
  };
}

describe("TicketTable", () => {
  const defaultProps = {
    tickets: [makeTicket("T-1", "First ticket"), makeTicket("T-2", "Second ticket")],
    selectedTicket: null,
    onSelectTicket: vi.fn(),
    visibleColumns: new Set<ColumnId>(["key", "title", "jiraStatus", "assignee", "points", "bv", "quality", "epic", "poStatus", "sprint", "type", "flagged", "notes", "pipeline"]),
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
    columnWidths: {},
    onColumnResize: vi.fn(),
    onColumnResetWidth: vi.fn(),
    sortField: "rank" as const,
    sortDir: "asc" as const,
    onSortChange: vi.fn(),
  };

  it("renders ticket rows for each ticket", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.getByTestId("row-T-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-T-2")).toBeInTheDocument();
  });

  it("renders table column headers", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("shows empty state when no tickets", () => {
    render(<TicketTable {...defaultProps} tickets={[]} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
  });

  it("calls onSortChange when header clicked", () => {
    const onSortChange = vi.fn();
    render(<TicketTable {...defaultProps} onSortChange={onSortChange} />);
    const titleHeader = screen.getByText("Title");
    fireEvent.click(titleHeader);
    expect(onSortChange).toHaveBeenCalled();
  });
});
