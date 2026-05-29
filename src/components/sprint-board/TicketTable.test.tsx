import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";

vi.mock("lucide-react", () => {
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
    jiraStatus: "TO DO",
    issueType: "Story",
    storyPoints: 3,
    businessValue: null,
    assignee: null,
    epic: null,
    sprintId: null,
    rank: "0|1",
    qualityScore: null,
    readiness: null,
    poStatus: null,
    labels: [],
    editState: null,
    poNotes: null,
    notes: "",
    isRemoved: false,
    lastChanged: null,
  };
}

describe("TicketTable", () => {
  const defaultProps = {
    tickets: [makeTicket("T-1", "First ticket"), makeTicket("T-2", "Second ticket")],
    selectedTicket: null,
    onSelectTicket: vi.fn(),
    visibleColumns: new Set(["key", "title", "status", "assignee", "points", "bv", "quality", "epic", "readiness", "poStatus", "labels", "sprint", "editState", "type", "lastChanged"]),
    checkedTickets: new Set<string>(),
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
