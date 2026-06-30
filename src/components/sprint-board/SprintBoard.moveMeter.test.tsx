import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { mutate } from "swr";

// Keep useSWR real (the hooks SprintBoard mounts rely on it) but spy the
// global `mutate` so we can assert the capacity meter refresh fires.
vi.mock("swr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("swr")>();
  return { ...actual, mutate: vi.fn() };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ slug: undefined }),
  usePathname: () => "/sprint-board",
}));

vi.mock("next/dynamic", () => ({ default: () => () => null }));

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
  useTicketDetail: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }),
}));

vi.mock("@/hooks/useTicketSessionMap", () => ({ useTicketSessionMap: () => ({ ticketSessionMap: {} }) }));
vi.mock("@/hooks/useLocalStorage", () => ({ useLocalStorage: (_key: string, initial: unknown) => [initial, vi.fn()] }));
vi.mock("@/hooks/useExportTask", () => ({ useExportTask: () => ({ status: "idle", exportResult: null, startExport: vi.fn() }) }));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useColumnConfig", () => ({
  useColumnConfig: () => ({ visible: new Set(["flag", "quality"]), loaded: true, toggleColumn: vi.fn(), applyVisible: vi.fn(), resetToDefaults: vi.fn() }),
}));

vi.mock("@/lib/prefetch", () => ({ prefetchTicketList: vi.fn(), setRouterPrefetch: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
  swrFetcher: vi.fn().mockResolvedValue([]),
  jira: { syncSprint: vi.fn().mockResolvedValue({}) },
}));

vi.mock("@/components/sprint-board/sprint-board-utils", () => ({
  mapJiraSprints: (s: unknown[]) => (s as Record<string, unknown>[]).map((sp) => ({ ...sp, id: String(sp.id), dateRange: "", state: sp.state || "active", ticketCount: 0 })),
  saveSprintSlots: vi.fn(),
  saveTicketMetadata: vi.fn().mockResolvedValue({}),
  bulkReviewStories: vi.fn(),
  bulkGenerateSubtasks: vi.fn(),
  computeSprintStats: () => ({ totalPoints: 10, donePoints: 3, todoPoints: 7 }),
  computeSprintWorkDays: () => ({ elapsed: 5, total: 10 }),
  scopePlaceholdersToSprintFilter: (placeholders: unknown[]) => placeholders,
}));

vi.mock("@/components/sprint-board/SprintSlots", () => ({ SprintSlots: () => <div data-testid="sprint-slots" /> }));
vi.mock("@/components/sprint-board/FilterBar", () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
  COLUMNS: [{ id: "key", label: "Key" }],
  SortDropdown: () => null,
  ColumnToggle: () => null,
}));

// Selecting a ticket flips `someChecked`, which mounts the bulk action bar.
vi.mock("@/components/sprint-board/TicketTable", () => ({
  TicketTable: ({ onToggleCheck }: { onToggleCheck: (k: string) => void }) => (
    <button data-testid="select-ticket" onClick={() => onToggleCheck("T-1")}>select</button>
  ),
}));

// Surface the move action so the test can fire it.
vi.mock("@/components/sprint-board/BulkActionBar", () => ({
  BulkActionBar: ({ onMoveSprint }: { onMoveSprint: (id: string) => void }) => (
    <button data-testid="move-sprint" onClick={() => onMoveSprint("2")}>move</button>
  ),
}));

vi.mock("@/components/sprint-board/SidePanel", () => ({ SidePanel: () => null }));
vi.mock("@/components/sprint-board/SprintAnalytics", () => ({ SprintAnalytics: () => null }));
vi.mock("@/components/sprint-board/SprintBoardHeader", () => ({ SprintBoardHeader: () => <div data-testid="board-header" /> }));
vi.mock("@/components/sprint-board/DragGhostOverlay", () => ({ DragGhostOverlay: () => null }));
vi.mock("@/components/sprint-board/SprintBoardDragDrop", () => ({
  SprintDropZoneBar: () => null,
  snapToPointer: vi.fn(),
  boardCollisionDetection: vi.fn(),
}));
vi.mock("@/components/sprint-board/ExportToasts", () => ({ ExportToasts: () => null }));

vi.mock("@/components/sprint-board/useSprintBoardFilters", () => ({
  useSprintBoardFilters: () => ({
    statusFilter: new Set(), epicFilter: new Set(), assigneeFilter: new Set(), readinessFilter: new Set(),
    editStateFilter: new Set(), issueTypeFilter: new Set(), gapsFilter: new Set(), teamFilter: new Set(), sprintFilter: new Set(),
    searchQuery: "",
    setStatusFilter: vi.fn(), setEpicFilter: vi.fn(), setAssigneeFilter: vi.fn(), setReadinessFilter: vi.fn(),
    setEditStateFilter: vi.fn(), setIssueTypeFilter: vi.fn(), setGapsFilter: vi.fn(), setTeamFilter: vi.fn(), setSprintFilter: vi.fn(), setSearchQuery: vi.fn(),
    sortedTickets: [{ key: "T-1", title: "Test", jiraStatus: "TO DO", issueType: "Story", storyPoints: 3, businessValue: null, assignee: null, epic: null, sprintId: "1", rank: "0|1", qualityScore: null, readiness: null, poStatus: null, labels: [], editState: null, poNotes: null, notes: "", isRemoved: false, lastChanged: null }],
    statusOptions: [], epicOptions: [], assigneeOptions: [], issueTypeOptions: [], teamOptions: [], sprintOptions: [],
    sprintNameMap: {}, activeView: null, activeViewId: null, sortField: "rank", sortDir: "asc",
    setSortField: vi.fn(), setSortDir: vi.fn(), visibleTags: new Set(["flag", "quality"]),
    resetFilters: vi.fn(), resetSprintViewFilters: vi.fn(),
    currentFiltersSnapshot: () => ({ status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: [], sprint: [] }),
    saveView: vi.fn(), deleteView: vi.fn(), savedViews: [],
  }),
}));

vi.mock("@/components/sprint-board/useGroupBy", () => ({
  useGroupBy: () => ({ groupBy: "none", setGroupBy: vi.fn(), collapsedGroups: new Set(), toggleCollapse: vi.fn(), allCollapsed: false, toggleAllGroups: vi.fn(), groups: [] }),
}));

vi.mock("@/components/sprint-board/useSprintBoardDragDrop", () => ({
  useSprintBoardDragDrop: () => ({ handleDragStart: vi.fn(), handleDragEnd: vi.fn(), draggingTicket: null }),
}));

vi.mock("@/components/sprint-board/useSprintBoardShortcuts", () => ({
  useSprintBoardShortcuts: () => ({ handleTableKeyDown: vi.fn() }),
}));

const bulkMoveSprint = vi.fn().mockResolvedValue({ ok: true, count: 1, destName: "Sprint 2" });

vi.mock("@/components/sprint-board/useTicketActions", () => ({
  useTicketActions: () => ({
    handlePoStatusChange: vi.fn(), handleReadinessChange: vi.fn(), handleBusinessValueChange: vi.fn(), handleStoryPointsChange: vi.fn(),
    handleJiraStatusChange: vi.fn(), handleIssueTypeChange: vi.fn(), handleTitleChange: vi.fn(),
    handleAssigneeChange: vi.fn(), handleEpicChange: vi.fn(), handleSprintChange: vi.fn(),
    handleCloseSubtasks: vi.fn(), handleSubtasksAdded: vi.fn(), handleGuestimationChange: vi.fn(),
    poStatuses: {}, readinessMap: {}, setReadinessMap: vi.fn(), syncFromApiTickets: vi.fn(),
  }),
}));

// The shared bulk dispatch now lives in useRowActions; the board's move wrapper calls
// its bulkMoveSprint and refreshes the capacity meter on success.
vi.mock("@/components/sprint-board/row-actions/useRowActions", () => ({
  useRowActions: () => ({
    rowMenu: null, setRowMenu: vi.fn(), handleRowContextMenu: vi.fn(), computeFlagState: () => "unflagged",
    bulkSetStatus: vi.fn(), bulkSetReadiness: vi.fn(), bulkSetEpic: vi.fn(),
    bulkUpdateAssignee: vi.fn(), bulkUpdateLabels: vi.fn(), bulkSetFlagged: vi.fn(),
    bulkMoveSprint, moveSprint: vi.fn(), quickMovesFor: () => [], currentSprintIdsFor: () => [], handleQuickMove: vi.fn(),
    inflightKeys: new Set(), handleBulkReview: vi.fn(), handleBulkGenerate: vi.fn(),
    isGeneratingSubtasks: false, copySelected: vi.fn(), openRefine: vi.fn(),
    refineModalOpen: false, setRefineModalOpen: vi.fn(), refineKeys: [],
    quickCreate: null, closeQuickCreate: vi.fn(), confirmQuickCreate: vi.fn(),
    suggestedSprintName: "", planPrevSprint: null,
  }),
}));

vi.mock("@/components/shared/LoadingState", () => ({ LoadingState: () => <div data-testid="loading" /> }));

const { default: SprintBoard } = await import("./SprintBoard");

describe("SprintBoard bulk move capacity meter", () => {
  it("refreshes the used-points meter after a successful bulk move", async () => {
    render(<SprintBoard />);

    fireEvent.click(screen.getByTestId("select-ticket"));
    fireEvent.click(await screen.findByTestId("move-sprint"));

    await waitFor(() => expect(bulkMoveSprint).toHaveBeenCalled());
    expect(mutate).toHaveBeenCalledWith("/api/sprints/used-points");
  });
});
