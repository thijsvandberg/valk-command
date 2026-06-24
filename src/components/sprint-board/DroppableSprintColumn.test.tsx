import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DroppableSprintColumn } from "./DroppableSprintColumn";
import type { Ticket, Sprint } from "@/types/ticket";

// BRDG-388: the Compare view now renders rows through the shared BoardRow. Stub
// SortableBoardRow so the test asserts the wiring (which props flow through, the
// shift-range selection closure) without pulling in BoardRow's heavy subtree.
const rowProps: Record<string, unknown>[] = [];
vi.mock("./BoardRow", () => ({
  SortableBoardRow: (props: Record<string, unknown>) => {
    rowProps.push(props);
    const ticket = props.ticket as Ticket;
    const idx = props.ticketIdx as number;
    const onCheckboxClick = props.onCheckboxClick as (key: string, idx: number, shift: boolean) => void;
    return (
      <tr data-testid={`row-${ticket.key}`}>
        <td>
          <button
            data-testid={`check-${ticket.key}`}
            onClick={(e) => onCheckboxClick(ticket.key, idx, e.shiftKey)}
          >
            {ticket.key}
          </button>
        </td>
      </tr>
    );
  },
}));

vi.mock("./GroupStatBar", () => ({ GroupStatBar: () => <div data-testid="stat-bar" /> }));
vi.mock("./SprintSelector", () => ({ SprintSelector: () => <div data-testid="sprint-selector" /> }));
vi.mock("@/components/shared/EmptyState", () => ({ EmptyState: () => <div data-testid="empty-state" /> }));
vi.mock("@/components/ui/Button", () => ({ Button: (p: Record<string, unknown>) => <button {...p} /> }));
vi.mock("@dnd-kit/core", () => ({ useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }) }));
vi.mock("@dnd-kit/sortable", () => ({ SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    CalendarRange: stub("calendar"),
    RefreshCw: stub("refresh"),
    X: stub("x"),
    ChevronDown: stub("chevron"),
    Search: stub("search"),
    Sheet: stub("sheet"),
  };
});

function makeTicket(n: number): Ticket {
  return { key: `K-${n}`, title: `Ticket ${n}`, type: "Story", jiraStatus: "TO DO" } as Ticket;
}

const sprints: Sprint[] = [{ id: "s1", name: "Sprint 1", state: "active" } as Sprint];

function baseProps(overrides: Partial<React.ComponentProps<typeof DroppableSprintColumn>> = {}) {
  return {
    columnId: "left" as const,
    sprintId: "s1",
    tickets: [makeTicket(0), makeTicket(1), makeTicket(2)],
    checkedKeys: new Set<string>(),
    selectedKey: null,
    syncing: false,
    onRefresh: vi.fn(),
    onToggleCheck: vi.fn(),
    onSelect: vi.fn(),
    someChecked: false,
    sprints,
    onChangeSprint: vi.fn(),
    activeDragId: null,
    dragOverId: null,
    onTitleChange: vi.fn(),
    editingTitleKey: null,
    onEditingTitleKeyChange: vi.fn(),
    readinessMap: {},
    onReadinessChange: vi.fn(),
    onJiraStatusChange: vi.fn(),
    onIssueTypeChange: vi.fn(),
    ...overrides,
  };
}

describe("DroppableSprintColumn (BRDG-388 BoardRow migration)", () => {
  beforeEach(() => {
    rowProps.length = 0;
  });

  it("renders one SortableBoardRow per ticket", () => {
    render(<DroppableSprintColumn {...baseProps()} />);
    expect(screen.getByTestId("row-K-0")).toBeInTheDocument();
    expect(screen.getByTestId("row-K-1")).toBeInTheDocument();
    expect(screen.getByTestId("row-K-2")).toBeInTheDocument();
  });

  it("renders no per-field column headers (the dense grid is retired)", () => {
    const { container } = render(<DroppableSprintColumn {...baseProps()} />);
    // The old TicketRow grid drove a <thead> of <th> labels (Key/SP/BV/...).
    expect(container.querySelector("thead")).toBeNull();
    expect(container.querySelector("th")).toBeNull();
    expect(screen.queryByText("Key")).toBeNull();
    expect(screen.queryByText("SP")).toBeNull();
  });

  it("does not pass legacy column props to the row", () => {
    render(<DroppableSprintColumn {...baseProps()} />);
    const first = rowProps[0];
    expect(first).not.toHaveProperty("col");
    expect(first).not.toHaveProperty("columnOrder");
    expect(first.sortableData).toEqual({ columnId: "left" });
  });

  it("toggles a single ticket on a plain checkbox click", () => {
    const onToggleCheck = vi.fn();
    render(<DroppableSprintColumn {...baseProps({ onToggleCheck })} />);
    fireEvent.click(screen.getByTestId("check-K-1"));
    expect(onToggleCheck).toHaveBeenCalledTimes(1);
    expect(onToggleCheck).toHaveBeenCalledWith("K-1");
  });

  it("selects the inclusive range on shift-click after an anchor click", () => {
    const onToggleCheck = vi.fn();
    render(<DroppableSprintColumn {...baseProps({ onToggleCheck })} />);
    // Anchor at row 0, then shift-click row 2 -> toggles K-0, K-1, K-2.
    fireEvent.click(screen.getByTestId("check-K-0"));
    fireEvent.click(screen.getByTestId("check-K-2"), { shiftKey: true });
    const toggled = onToggleCheck.mock.calls.map((c) => c[0]);
    expect(toggled).toEqual(expect.arrayContaining(["K-0", "K-1", "K-2"]));
  });
});
