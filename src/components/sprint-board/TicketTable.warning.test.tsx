import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";
import { DEFAULT_VISIBLE_TAGS } from "./filter-bar-types";

// Exercises the warning filter MODE at the grouped TicketTable level (BRDG-313):
// clicking the group warning narrows to the warning set and labels each row; clicking
// again restores; changing the global filter signature exits the mode.

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return { Sheet: stub("sheet"), Inbox: stub("inbox"), Plus: stub("plus") };
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
  useVirtualizer: () => ({ getVirtualItems: () => [], getTotalSize: () => 0, measureElement: vi.fn() }),
}));

// Render the row key plus any warning labels so the test can assert both which rows are
// visible and which carry labels.
vi.mock("./BoardRow", () => ({
  BoardRow: ({ ticket, warningLabels }: { ticket: Ticket; warningLabels?: string[] }) => (
    <tr data-testid={`row-${ticket.key}`}>
      <td>{ticket.title}{(warningLabels ?? []).map((l) => <span key={l} data-testid={`label-${ticket.key}`}>{l}</span>)}</td>
    </tr>
  ),
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

// A clickable warning button + a readout of the active criterion so the test can drive the
// toggle and observe the lit state.
vi.mock("@/components/sprint-board/GroupStatBar", () => ({
  GroupStatBar: ({ onFilterChange, activeCriterion }: { onFilterChange?: (c: string | null) => void; activeCriterion?: string | null }) => (
    <button data-testid="warning" data-active={String(activeCriterion)} onClick={() => onFilterChange?.("unpointed")}>warn</button>
  ),
}));

vi.mock("@/components/shared/IssueTypeIcon", () => ({ IssueTypeIcon: () => null }));
vi.mock("@/components/shared/EmptyState", () => ({ EmptyState: () => <div data-testid="empty" /> }));
vi.mock("@/components/sprint-board/GroupCard", () => ({
  GROUP_CARD_CLASS: "",
  GroupCard: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => (
    <div>{header}{children}</div>
  ),
}));

function makeTicket(key: string, partial: Partial<Ticket> = {}): Ticket {
  return {
    key,
    title: key,
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
    openSubtaskCount: 0,
    ...partial,
  } as Ticket;
}

// A pointed ticket (clean) and an unpointed one (a warning) in a non-sprint group, so the
// only matching warning is the sprint-independent kinds. Use a deprecated-with-points
// ticket so the warning matches regardless of active-sprint gating.
const CLEAN = makeTicket("T-clean", { storyPoints: 5 });
const FLAGGED = makeTicket("T-bad", { jiraStatus: "DEPRECATED", storyPoints: 8 });

const baseProps = {
  tickets: [CLEAN, FLAGGED],
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
  groupBy: "epic" as const,
  groups: [{ key: "E-1", label: "Epic one", tickets: [CLEAN, FLAGGED], sortOrder: 0 }],
};

describe("TicketTable warning filter mode (BRDG-313)", () => {
  it("narrows to the warning set and labels rows on click, restores on second click", () => {
    render(<TicketTable {...baseProps} />);
    // Both rows visible, no labels yet.
    expect(screen.getByTestId("row-T-clean")).toBeInTheDocument();
    expect(screen.getByTestId("row-T-bad")).toBeInTheDocument();
    expect(screen.queryByTestId("label-T-bad")).toBeNull();

    // First click: only the problem row remains, and it carries its label.
    fireEvent.click(screen.getByTestId("warning"));
    expect(screen.queryByTestId("row-T-clean")).toBeNull();
    expect(screen.getByTestId("row-T-bad")).toBeInTheDocument();
    expect(screen.getByTestId("label-T-bad")).toHaveTextContent("Deprecated but still has story points");
    expect(screen.getByTestId("warning").getAttribute("data-active")).toBe("unpointed");

    // Second click: restored, labels gone.
    fireEvent.click(screen.getByTestId("warning"));
    expect(screen.getByTestId("row-T-clean")).toBeInTheDocument();
    expect(screen.getByTestId("row-T-bad")).toBeInTheDocument();
    expect(screen.queryByTestId("label-T-bad")).toBeNull();
    expect(screen.getByTestId("warning").getAttribute("data-active")).toBe("null");
  });

  it("exits the mode when the global filter signature changes", () => {
    const { rerender } = render(<TicketTable {...baseProps} filterSignature="sig-a" />);
    fireEvent.click(screen.getByTestId("warning"));
    expect(screen.queryByTestId("row-T-clean")).toBeNull(); // narrowed

    // A global filter change (new signature) clears the warning narrowing.
    rerender(<TicketTable {...baseProps} filterSignature="sig-b" />);
    expect(screen.getByTestId("row-T-clean")).toBeInTheDocument();
    expect(screen.queryByTestId("label-T-bad")).toBeNull();
    expect(screen.getByTestId("warning").getAttribute("data-active")).toBe("null");
  });
});
