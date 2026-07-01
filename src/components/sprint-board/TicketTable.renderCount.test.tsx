import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketTable } from "./TicketTable";
import type { Ticket } from "@/types/ticket";
import type { InlineTagId } from "./filter-bar-types";
import { DEFAULT_VISIBLE_TAGS } from "./filter-bar-types";

// BRDG-416: a render-count harness. BoardRow is mocked with a real `memo()` wrapper
// (mirroring the production shallow memo) plus a per-key render counter, so we can
// assert that a single-row interaction does not fan out to the sibling rows.
const h = vi.hoisted(() => ({ counts: {} as Record<string, number> }));

vi.mock("./BoardRow", async () => {
  const { memo, createElement } = await import("react");
  const MockRow = memo(function MockRow({ ticket }: { ticket: Ticket }) {
    h.counts[ticket.key] = (h.counts[ticket.key] ?? 0) + 1;
    return createElement("tr", { "data-testid": `row-${ticket.key}` }, createElement("td", null, ticket.title));
  });
  return { BoardRow: MockRow, SortableBoardRow: MockRow };
});

vi.mock("lucide-react", () => {
  // eslint-disable-next-line react/display-name
  const stub = (name: string) => (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  return {
    Sheet: stub("sheet"), Inbox: stub("inbox"), Plus: stub("plus"),
    ChevronDown: stub("chevron-down"), CheckCheck: stub("check-check"),
  };
});

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(), KeyboardSensor: vi.fn(), PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})), useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  DragOverlay: () => null,
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({ getVirtualItems: () => [], getTotalSize: () => 0, measureElement: vi.fn() }),
}));

// Stable references so the pipeline-derived row props never churn between renders;
// otherwise every render would re-render every row and mask the measurement.
const STABLE_FOLLOWED: string[] = [];
const STABLE_FOLLOW = { follow: vi.fn(), unfollow: vi.fn() };
const STABLE_MAP = {};
vi.mock("@/hooks/usePipelines", () => ({
  useFollowedTickets: () => ({ data: STABLE_FOLLOWED }),
  useFollowTicket: () => STABLE_FOLLOW,
  useLastDeployed: () => ({ data: STABLE_MAP }),
  usePipelineHealth: () => ({ data: STABLE_MAP }),
}));
vi.mock("@/components/sprint-board/TicketTableCells", () => ({
  POStatusCell: () => null, QualityBadge: () => null, POStatusIcon: () => null,
  EditStateDot: () => null, getJiraUrl: () => "#",
}));
vi.mock("@/components/sprint-board/GroupStatBar", () => ({ GroupStatBar: () => null }));
vi.mock("@/components/shared/IssueTypeIcon", () => ({ IssueTypeIcon: () => null }));
vi.mock("@/components/shared/EmptyState", () => ({ EmptyState: ({ title }: { title: string }) => <div>{title}</div> }));

function makeTicket(key: string): Ticket {
  return {
    key, title: key, type: "story", epic: null, epicKey: null, jiraStatus: "TO DO",
    storyPoints: 3, assignee: null, flagged: false, readiness: null, poStatus: null,
    qualityScore: null, businessValue: null, editState: "clean", notes: "",
  };
}

// Stable handler/map references reused across every render.
const onSelectTicket = vi.fn();
const onToggleCheck = vi.fn();
const onRangeCheck = vi.fn();
const onToggleAll = vi.fn();
const onPoStatusChange = vi.fn();
const onTableKeyDown = vi.fn();
const visibleTags = new Set<InlineTagId>(DEFAULT_VISIBLE_TAGS);
const poStatuses = {};
const readinessMap = {};
const tickets = [makeTicket("T-1"), makeTicket("T-2"), makeTicket("T-3")];

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    tickets, visibleTags, poStatuses, readinessMap,
    onSelectTicket, onToggleCheck, onRangeCheck, onToggleAll, onPoStatusChange, onTableKeyDown,
    sortField: "rank" as const, sortDir: "asc" as const,
    selectedTicket: null as string | null,
    focusedTicketIdx: -1,
    checkedTickets: new Set<string>(),
    someChecked: false,
    allChecked: false,
    ...overrides,
  };
}

describe("TicketTable render fan-out (BRDG-416)", () => {
  beforeEach(() => { for (const k in h.counts) delete h.counts[k]; });

  it("selecting a row re-renders only that row, not its siblings", () => {
    const props = baseProps();
    const { rerender } = render(<TicketTable {...props} />);
    const before = { ...h.counts };

    // Select T-1 (only selectedTicket changes; every other input ref is identical).
    rerender(<TicketTable {...props} selectedTicket="T-1" />);

    expect(h.counts["T-1"]).toBeGreaterThan(before["T-1"]); // the selected row updates
    expect(h.counts["T-2"]).toBe(before["T-2"]); // siblings must NOT re-render
    expect(h.counts["T-3"]).toBe(before["T-3"]);
  });

  it("changing the selection re-renders only the old and new selected rows", () => {
    const props = baseProps({ selectedTicket: "T-1" });
    const { rerender } = render(<TicketTable {...props} />);
    const before = { ...h.counts };

    rerender(<TicketTable {...props} selectedTicket="T-2" />);

    expect(h.counts["T-1"]).toBeGreaterThan(before["T-1"]); // deselected
    expect(h.counts["T-2"]).toBeGreaterThan(before["T-2"]); // newly selected
    expect(h.counts["T-3"]).toBe(before["T-3"]); // untouched sibling stays put
  });

  it("checking a row (someChecked unchanged) re-renders only that row", () => {
    const props = baseProps({ checkedTickets: new Set(["T-1"]), someChecked: true });
    const { rerender } = render(<TicketTable {...props} />);
    const before = { ...h.counts };

    // Add T-2 to the selection; someChecked stays true, so no legitimate all-row render.
    rerender(<TicketTable {...props} checkedTickets={new Set(["T-1", "T-2"])} someChecked />);

    expect(h.counts["T-2"]).toBeGreaterThan(before["T-2"]); // the toggled row updates
    expect(h.counts["T-1"]).toBe(before["T-1"]); // already-checked sibling stays put
    expect(h.counts["T-3"]).toBe(before["T-3"]);
  });

  it("hover-focusing a row re-renders only the old and new focused rows", () => {
    const props = baseProps({ focusedTicketIdx: 0 });
    const { rerender } = render(<TicketTable {...props} />);
    const before = { ...h.counts };

    rerender(<TicketTable {...props} focusedTicketIdx={1} />);

    expect(h.counts["T-1"]).toBeGreaterThan(before["T-1"]); // lost focus
    expect(h.counts["T-2"]).toBeGreaterThan(before["T-2"]); // gained focus
    expect(h.counts["T-3"]).toBe(before["T-3"]); // untouched
  });
});
