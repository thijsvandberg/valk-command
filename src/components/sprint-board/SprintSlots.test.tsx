import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SprintSlots } from "./SprintSlots";
import type { Sprint } from "@/types/ticket";
import type { SavedView } from "./filter-bar-types";

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
