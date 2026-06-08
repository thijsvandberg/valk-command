import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
  };
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

// The headerless board renders a forked flex row (BoardRow), not the legacy TicketRow.
vi.mock("./BoardRow", () => ({
  BoardRow: ({ ticket }: { ticket: Ticket }) => <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>,
  SortableBoardRow: ({ ticket }: { ticket: Ticket }) => <tr data-testid={`row-${ticket.key}`}><td>{ticket.title}</td></tr>,
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
  EmptyState: () => <div data-testid="empty" />,
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

  it("renders no column headers", () => {
    render(<TicketTable {...defaultProps} />);
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.queryByText("Title")).toBeNull();
  });

  it("shows empty state when no tickets", () => {
    render(<TicketTable {...defaultProps} tickets={[]} />);
    expect(screen.getByTestId("empty")).toBeInTheDocument();
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
});
