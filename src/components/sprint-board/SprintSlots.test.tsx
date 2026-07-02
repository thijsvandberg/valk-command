import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintSlots } from "./SprintSlots";
import type { Sprint } from "@/types/ticket";
import type { SavedView, InlineTagId } from "./filter-bar-types";

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return { id: "1", name: "BT: 139", state: "active", dateRange: "", ticketCount: 0, ...overrides };
}

const NUM_139 = makeSprint({ id: "139", name: "BT: 139", state: "active", ticketCount: 12 });
const NUM_140 = makeSprint({ id: "140", name: "BT: 140", state: "future" });
const BACKLOG = makeSprint({ id: "__backlog__", name: "Backlog", state: "backlog", ticketCount: 40 });
const BT_BACKLOG = makeSprint({ id: "b1", name: "BT: Backlog", state: "future", ticketCount: 7 });
const GXP_BACKLOG = makeSprint({ id: "b2", name: "GXP: Backlog", state: "future", ticketCount: 3 });
const OVERALL = makeSprint({ id: "o1", name: "Overall refinement", state: "future" });

const ALL_SPRINTS = [NUM_139, NUM_140, BACKLOG, BT_BACKLOG, GXP_BACKLOG, OVERALL];

const OVERALL_PRESET: SavedView = {
  id: "__preset:overall-refinement__",
  title: "Overall refinement",
  filters: { status: [], epic: [], assignee: [], readiness: [], editState: [], sprint: ["o1"] },
  sort: { field: "rank", direction: "asc" },
};

function makeFilterProps() {
  return {
    statusFilter: new Set<string>(),
    epicFilter: new Set<string>(),
    assigneeFilter: new Set<string>(),
    readinessFilter: new Set<string>(),
    editStateFilter: new Set<string>(),
    issueTypeFilter: new Set<string>(),
    onStatusFilterChange: vi.fn(),
    onEpicFilterChange: vi.fn(),
    onAssigneeFilterChange: vi.fn(),
    onReadinessFilterChange: vi.fn(),
    onEditStateFilterChange: vi.fn(),
    onIssueTypeFilterChange: vi.fn(),
    statusOptions: [],
    epicOptions: [],
    assigneeOptions: [],
    issueTypeOptions: [],
    onClearAll: vi.fn(),
    columnVisible: new Set<InlineTagId>(),
    onColumnToggle: vi.fn(),
    onColumnReset: vi.fn(),
  };
}

// JSDOM cannot evaluate CSS container queries, so the narrow-pane behavior is
// asserted through the gate classes on each tool's wrapper (BRDG: see SprintSlots).
const NARROW_GATE = "hidden @[46rem]/tabbar:flex";

const WITH_CONTROLS = {
  sortField: "rank" as const,
  sortDir: "asc" as const,
  onSortChange: vi.fn(),
  searchQuery: "",
  onSearchChange: vi.fn(),
  filterProps: makeFilterProps(),
};

/** JSDOM has no layout, so overflow is faked to make the scroll fades render. */
function forceScrollOverflow() {
  const scroller = document.body.querySelector('[class*="overflow-x-auto"]') as HTMLElement;
  Object.defineProperty(scroller, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(scroller, "scrollWidth", { value: 300, configurable: true });
  Object.defineProperty(scroller, "scrollLeft", { value: 10, configurable: true });
  fireEvent.scroll(scroller);
}

/** Climbs from a tool's trigger to its direct-child wrapper inside the right-side cluster. */
function toolWrapper(el: HTMLElement): HTMLElement {
  let node: HTMLElement = el;
  while (node.parentElement && !node.parentElement.className.includes("ml-auto")) {
    node = node.parentElement;
  }
  return node;
}

function renderBar(overrides: Partial<Parameters<typeof SprintSlots>[0]> = {}) {
  const props = {
    slotSprints: ["139", "140"],
    pillSlotSprints: ["139", "140"],
    activeSprintId: "139" as string | null,
    allActive: false,
    sprints: ALL_SPRINTS,
    backlogSprints: [BACKLOG, BT_BACKLOG, GXP_BACKLOG],
    activeBacklogId: null as string | null,
    onBacklogSelect: vi.fn(),
    onSlotClick: vi.fn(),
    onAllClick: vi.fn(),
    editingSlot: null as number | null,
    onSlotEdit: vi.fn(),
    onSprintSelect: vi.fn(),
    onEditClose: vi.fn(),
    onReorderSlots: vi.fn(),
    savedViews: [OVERALL_PRESET] as SavedView[],
    activeViewId: null as string | null,
    onViewClick: vi.fn(),
    onSaveCurrentView: vi.fn(),
    onOpenSprintList: vi.fn(),
    onCreateSprint: vi.fn(),
    ...overrides,
  };
  render(<SprintSlots {...props} />);
  return props;
}

describe("SprintSlots views bar (BRDG-319)", () => {
  it("renders numbered sprints as pills and All as the default control", () => {
    renderBar();
    expect(screen.getByText("BT: 139")).toBeTruthy();
    expect(screen.getByText("BT: 140")).toBeTruthy();
    expect(screen.getByText("All")).toBeTruthy();
  });

  it("caps the views bar to the board content width so it aligns with the ticket list (BRDG-361)", () => {
    renderBar();
    const cap = document.body.querySelector(".max-w-\\[1280px\\]");
    expect(cap).toBeTruthy();
    expect(cap).toContainElement(screen.getByText("All"));
  });

  it("does not render backlog or Overall-refinement sprints as pills", () => {
    renderBar();
    // Backlogs live behind the dropdown trigger, not as inline pills.
    expect(screen.queryByText("BT: Backlog")).toBeNull();
    expect(screen.queryByText("GXP: Backlog")).toBeNull();
    // "Overall refinement" only appears inside the (closed) Saved menu, not as a pill.
    expect(screen.queryByText("Overall refinement")).toBeNull();
  });

  it("lists backlog sprints inside the Backlogs dropdown", () => {
    renderBar();
    fireEvent.click(screen.getByTitle("Backlogs"));
    const menuBacklog = screen.getByText("BT: Backlog");
    expect(menuBacklog).toBeTruthy();
    expect(screen.getByText("GXP: Backlog")).toBeTruthy();
    expect(screen.getAllByText("Backlog").length).toBeGreaterThan(0);
  });

  it("orders the Backlogs menu BT: Backlog, then Backlog, then the rest", () => {
    renderBar();
    fireEvent.click(screen.getByTitle("Backlogs"));
    const menu = screen.getByText("GXP: Backlog").closest("div")!;
    const labels = Array.from(menu.querySelectorAll("button")).map((b) =>
      (b.textContent ?? "").replace(/\d+$/, "").trim(),
    );
    expect(labels[0]).toBe("BT: Backlog");
    expect(labels[1]).toBe("Backlog");
    expect(labels[2]).toBe("GXP: Backlog");
  });

  it("calls onBacklogSelect with the sprint id when a backlog is chosen", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTitle("Backlogs"));
    fireEvent.click(screen.getByText("BT: Backlog"));
    expect(props.onBacklogSelect).toHaveBeenCalledWith("b1");
  });

  it("shows the active backlog name on the Backlogs trigger", () => {
    renderBar({ activeBacklogId: "b1" });
    expect(within(screen.getByTitle("Backlogs")).getByText("BT: Backlog")).toBeTruthy();
  });

  it("renders null Backlogs trigger when there are no backlogs and no sprint actions", () => {
    renderBar({ backlogSprints: [], onOpenSprintList: undefined, onCreateSprint: undefined });
    expect(screen.queryByTitle("Backlogs")).toBeNull();
  });

  it("keeps the Backlogs trigger for sprint actions even with no backlogs", () => {
    renderBar({ backlogSprints: [] });
    expect(screen.getByTitle("Backlogs")).toBeTruthy();
  });

  it("surfaces saved views (incl. Overall refinement preset) in the Saved menu", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTitle("Saved filters"));
    const refinement = screen.getByText("Overall refinement");
    fireEvent.click(refinement);
    expect(props.onViewClick).toHaveBeenCalledWith(OVERALL_PRESET);
  });

  it("saves the current view from the Saved menu", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTitle("Saved filters"));
    fireEvent.click(screen.getByText("Save current view…"));
    const input = screen.getByPlaceholderText("View name…");
    fireEvent.change(input, { target: { value: "My filter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSaveCurrentView).toHaveBeenCalledWith("My filter");
  });

  it("opens sprint list and create sprint from the Backlogs dropdown footer", () => {
    const props = renderBar();
    fireEvent.click(screen.getByTitle("Backlogs"));
    fireEvent.click(screen.getByText("Sprint list"));
    expect(props.onOpenSprintList).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Backlogs"));
    fireEvent.click(screen.getByText("New sprint"));
    expect(props.onCreateSprint).toHaveBeenCalled();
  });

  it("fires onAllClick when All is clicked", () => {
    const props = renderBar();
    fireEvent.click(screen.getByText("All"));
    expect(props.onAllClick).toHaveBeenCalled();
  });

  it("does not render the standalone field-toggle, sort or filter-bar buttons (BRDG-344)", () => {
    renderBar();
    expect(screen.queryByTitle("Toggle fields")).toBeNull();
    expect(screen.queryByTitle("Show filters")).toBeNull();
    expect(screen.queryByTitle("Hide filters")).toBeNull();
  });

  it("renders the unified controls cluster when filter props are supplied (BRDG-344)", () => {
    renderBar({
      sortField: "rank",
      sortDir: "asc",
      onSortChange: vi.fn(),
      searchQuery: "",
      onSearchChange: vi.fn(),
      filterProps: makeFilterProps(),
    });
    expect(screen.getByLabelText("Filters")).toBeTruthy();
  });

  it("hides the view tools behind a container-width gate so a narrow pane frees space for pills", () => {
    renderBar(WITH_CONTROLS);
    const bar = Array.from(document.body.querySelectorAll("div")).find((d) =>
      d.className.includes("@container/tabbar"),
    );
    expect(bar).toBeTruthy();
    expect(toolWrapper(screen.getByTitle("Saved filters")).className).toContain(NARROW_GATE);
    expect(toolWrapper(screen.getByLabelText("Filters")).className).toContain(NARROW_GATE);
  });

  it("keeps the controls cluster visible in narrow panes while filters are active", () => {
    renderBar({ ...WITH_CONTROLS, activeFilterCount: 2 });
    const wrapper = toolWrapper(screen.getByLabelText("Filters"));
    expect(wrapper.className).not.toContain("hidden");
    // Saved has no active view, so it still yields to the pills.
    expect(toolWrapper(screen.getByTitle("Saved filters")).className).toContain(NARROW_GATE);
  });

  it("keeps the controls cluster visible in narrow panes while a search query is active", () => {
    renderBar({ ...WITH_CONTROLS, searchQuery: "dlq" });
    expect(toolWrapper(screen.getByLabelText("Filters")).className).not.toContain("hidden");
  });

  it("keeps the Saved menu visible in narrow panes while a saved view is active", () => {
    renderBar({ ...WITH_CONTROLS, activeViewId: OVERALL_PRESET.id });
    expect(toolWrapper(screen.getByTitle("Saved filters")).className).not.toContain("hidden");
  });

  it("always gates group-by and collapse-all in narrow panes, even with filters active", () => {
    renderBar({
      ...WITH_CONTROLS,
      allActive: true,
      activeSprintId: null,
      groupBy: "none" as const,
      onGroupByChange: vi.fn(),
      groupCount: 2,
      onToggleCollapseAll: vi.fn(),
      activeFilterCount: 3,
    });
    expect(toolWrapper(screen.getByTitle("Group by")).className).toContain(NARROW_GATE);
    expect(toolWrapper(screen.getByTitle("Collapse all groups")).className).toContain(NARROW_GATE);
  });

  it("colors both scroll fades with the bar background and lets the right fade run flush to the bar edge when the tools are gated", () => {
    renderBar(WITH_CONTROLS);
    forceScrollOverflow();
    const rightFade = document.body.querySelector('[class*="bg-gradient-to-l"]') as HTMLElement;
    const leftFade = document.body.querySelector('[class*="bg-gradient-to-r"]') as HTMLElement;
    expect(rightFade.className).toContain("from-surface-chrome");
    expect(leftFade.className).toContain("from-surface-chrome");
    expect(rightFade.className).toContain("@max-[46rem]/tabbar:-right-6");
    expect(rightFade.className).toContain("@max-[46rem]/tabbar:w-12");
  });

  it("keeps the right fade inside the scroller when active filters pin the controls cluster in narrow panes", () => {
    renderBar({ ...WITH_CONTROLS, activeFilterCount: 1 });
    forceScrollOverflow();
    const rightFade = document.body.querySelector('[class*="bg-gradient-to-l"]') as HTMLElement;
    expect(rightFade.className).not.toContain("@max-[46rem]");
  });

  it("closes the Backlogs dropdown on Escape and on outside click", () => {
    renderBar();
    fireEvent.click(screen.getByTitle("Backlogs"));
    expect(screen.getByText("GXP: Backlog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("GXP: Backlog")).toBeNull();

    fireEvent.click(screen.getByTitle("Backlogs"));
    expect(screen.getByText("GXP: Backlog")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("GXP: Backlog")).toBeNull();
  });
});
