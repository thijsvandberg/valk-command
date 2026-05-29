import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("lucide-react", () => ({
  Check: () => <span data-testid="check-icon" />,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: () => null,
}));

vi.mock("@/hooks/useSprintBoard", () => ({
  useJiraSprints: () => ({
    sprints: [{ id: 1, name: "Sprint 1", state: "active", startDate: "2026-01-01", endDate: "2026-01-14", goal: null }],
    backlogCount: 2,
    data: {},
  }),
  useTickets: () => ({
    data: [
      { key: "T-1", title: "Test", jiraStatus: "TO DO", issueType: "Story", storyPoints: 3, businessValue: null, assignee: null, epic: null, sprintId: "1", rank: "0|1", qualityScore: null, readiness: null, poStatus: null, labels: [], editState: null, poNotes: null, notes: "", isRemoved: false, lastChanged: null },
    ],
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("@/hooks/useTicketSessionMap", () => ({
  useTicketSessionMap: () => ({ ticketSessionMap: {} }),
}));

vi.mock("@/hooks/useLocalStorage", () => ({
  useLocalStorage: () => [null, vi.fn()],
}));

vi.mock("@/hooks/useExportTask", () => ({
  useExportTask: () => ({ status: "idle", exportResult: null, startExport: vi.fn() }),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: vi.fn(),
}));

vi.mock("@/hooks/useColumnWidths", () => ({
  useColumnWidths: () => ({ widths: {}, setWidth: vi.fn(), resetWidth: vi.fn() }),
}));

vi.mock("@/hooks/useColumnConfig", () => ({
  useColumnConfig: () => ({ order: [], visible: new Set(["key", "title"]), setColumnOrder: vi.fn(), toggleColumn: vi.fn(), resetTo: vi.fn(), resetToDefaults: vi.fn() }),
}));

vi.mock("@/lib/prefetch", () => ({
  prefetchTicketList: vi.fn(),
  setRouterPrefetch: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  jira: { syncSprint: vi.fn().mockResolvedValue({}) },
}));

vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  mapJiraSprints: (s: unknown[]) => s.map((sp: Record<string, unknown>) => ({ ...sp, id: String(sp.id), dateRange: "", state: sp.state || "active", ticketCount: 0 })),
  saveSprintSlots: vi.fn(),
  saveTicketMetadata: vi.fn().mockResolvedValue({}),
  bulkReviewStories: vi.fn(),
  bulkGenerateSubtasks: vi.fn(),
  computeSprintStats: () => ({ totalPoints: 10, donePoints: 3, todoPoints: 7 }),
  computeSprintWorkDays: () => ({ elapsed: 5, total: 10 }),
}));

vi.mock("@/components/sprint-board/SprintSlots", () => ({
  SprintSlots: () => <div data-testid="sprint-slots">Sprint Slots</div>,
}));

vi.mock("@/components/sprint-board/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
  COLUMNS: [{ id: "key", label: "Key" }],
  SortDropdown: () => null,
  ColumnToggle: () => null,
}));

vi.mock("@/components/sprint-board/TicketTable", () => ({
  TicketTable: () => <div data-testid="ticket-table">Ticket Table</div>,
}));

vi.mock("@/components/sprint-board/BulkActionBar", () => ({
  BulkActionBar: () => null,
}));

vi.mock("@/components/sprint-board/SidePanel", () => ({
  SidePanel: () => null,
}));

vi.mock("@/components/sprint-board/SprintAnalytics", () => ({
  SprintAnalytics: () => null,
}));

vi.mock("@/components/sprint-board/SprintBoardHeader", () => ({
  SprintBoardHeader: () => <div data-testid="board-header" />,
}));

vi.mock("@/components/sprint-board/DragGhostOverlay", () => ({
  DragGhostOverlay: () => null,
}));

vi.mock("@/components/sprint-board/SprintBoardDragDrop", () => ({
  SprintDropZoneBar: () => null,
  snapToPointer: vi.fn(),
  boardCollisionDetection: vi.fn(),
}));

vi.mock("@/components/sprint-board/ExportToasts", () => ({
  ExportToasts: () => null,
}));

vi.mock("@/components/sprint-board/useSprintBoardFilters", () => ({
  useSprintBoardFilters: () => ({
    statusFilter: new Set(),
    epicFilter: new Set(),
    assigneeFilter: new Set(),
    readinessFilter: new Set(),
    editStateFilter: new Set(),
    issueTypeFilter: new Set(),
    gapsFilter: new Set(),
    teamFilter: new Set(),
    sprintFilter: new Set(),
    searchQuery: "",
    setStatusFilter: vi.fn(),
    setEpicFilter: vi.fn(),
    setAssigneeFilter: vi.fn(),
    setReadinessFilter: vi.fn(),
    setEditStateFilter: vi.fn(),
    setIssueTypeFilter: vi.fn(),
    setGapsFilter: vi.fn(),
    setTeamFilter: vi.fn(),
    setSprintFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    sortedTickets: [{ key: "T-1", title: "Test", jiraStatus: "TO DO", issueType: "Story", storyPoints: 3, businessValue: null, assignee: null, epic: null, sprintId: "1", rank: "0|1", qualityScore: null, readiness: null, poStatus: null, labels: [], editState: null, poNotes: null, notes: "", isRemoved: false, lastChanged: null }],
    statusOptions: [],
    epicOptions: [],
    assigneeOptions: [],
    issueTypeOptions: [],
    teamOptions: [],
    sprintOptions: [],
    sprintNameMap: {},
    activeView: null,
    activeViewId: null,
    sortField: "rank",
    sortDir: "asc",
    setSortField: vi.fn(),
    setSortDir: vi.fn(),
    visibleColumns: new Set(["key", "title"]),
    resetFilters: vi.fn(),
    saveView: vi.fn(),
    deleteView: vi.fn(),
    savedViews: [],
  }),
}));

vi.mock("@/components/sprint-board/useGroupBy", () => ({
  useGroupBy: () => ({ groups: null, groupByOption: null, setGroupByOption: vi.fn() }),
}));

vi.mock("@/components/sprint-board/useSprintBoardDragDrop", () => ({
  useSprintBoardDragDrop: () => ({ handleDragStart: vi.fn(), handleDragEnd: vi.fn(), draggingTicket: null }),
}));

vi.mock("@/components/sprint-board/useSprintBoardShortcuts", () => ({
  useSprintBoardShortcuts: () => ({ handleTableKeyDown: vi.fn() }),
}));

vi.mock("@/components/sprint-board/useTicketActions", () => ({
  useTicketActions: () => ({
    handlePoStatusChange: vi.fn(),
    handleReadinessChange: vi.fn(),
    handleBVChange: vi.fn(),
    handleSPChange: vi.fn(),
    handleJiraStatusChange: vi.fn(),
    handleIssueTypeChange: vi.fn(),
    handleTitleChange: vi.fn(),
    handleCloseSubtasks: vi.fn(),
    handleNotesChange: vi.fn(),
    handleRefreshFromJira: vi.fn(),
    poStatuses: {},
    readinessMap: {},
    inflightKeys: new Set(),
    syncFromApiTickets: vi.fn(),
  }),
}));

vi.mock("@/components/shared/LoadingState", () => ({
  LoadingState: () => <div data-testid="loading">Loading...</div>,
}));

// Import after all mocks
const { default: SprintBoard } = await import("./SprintBoard");

describe("SprintBoard", () => {
  it("renders sprint slots and ticket table", () => {
    render(<SprintBoard />);
    expect(screen.getByTestId("sprint-slots")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-table")).toBeInTheDocument();
  });

  it("renders filter bar", () => {
    render(<SprintBoard />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("renders board header", () => {
    render(<SprintBoard />);
    expect(screen.getByTestId("board-header")).toBeInTheDocument();
  });
});
